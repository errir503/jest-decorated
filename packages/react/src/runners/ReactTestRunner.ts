import { ReactWrapper } from "enzyme";
import { isArray, isObject } from "@js-utilities/typecheck";
import {
    IDescribeRunner,
    ITestRunner,
    PreProcessorData,
    PreProcessor,
    TestEntity,
    IReactExtension,
} from "@jest-decorated/shared";

import { ReactExtension } from "../extensions";

export class ReactTestRunner implements ITestRunner {

    private static getReactExtension(describeRunner: IDescribeRunner): IReactExtension {
        return ReactExtension.getReactExtension(describeRunner?.getClass());
    }

    private static createComponentContainers(describeRunner: IDescribeRunner): void {
        ReactTestRunner.getReactExtension(describeRunner)?.getComponentService()
            .createComponentContainers();
    }

    public constructor(private readonly defaultTestsRunner: ITestRunner) {}

    public beforeTestsJestRegistration(
        describeRunner: IDescribeRunner,
        parentDescribeRunner?: IDescribeRunner
    ): void {
        ReactTestRunner.createComponentContainers(parentDescribeRunner);
        ReactTestRunner.createComponentContainers(describeRunner);
        this.defaultTestsRunner.beforeTestsJestRegistration(describeRunner);
    }

    public registerTestsInJest(
        describeRunner: IDescribeRunner,
        parentDescribeRunner?: IDescribeRunner
    ): void {
        ReactTestRunner
            .getReactExtension(describeRunner)
            .getComponentService()
            .createActWrappers(describeRunner.getClassInstance());
        this.registerComponentPreProcessors(describeRunner, parentDescribeRunner);
        this.defaultTestsRunner.registerTestsInJest(describeRunner, parentDescribeRunner);
    }

    public afterTestsJestRegistration(
        describeRunner: IDescribeRunner,
        parentDescribeRunner?: IDescribeRunner
    ): void {
        this.defaultTestsRunner.afterTestsJestRegistration(describeRunner, parentDescribeRunner);
    }

    private registerComponentPreProcessors(
        describeRunner: IDescribeRunner,
        parentDescribeRunner?: IDescribeRunner
    ): void {
        const reactExtension = ReactTestRunner.getReactExtension(describeRunner);
        const testsService = describeRunner.getTestsService();
        const hasComponentProvider = reactExtension
            .getComponentService()
            .isComponentProviderRegistered();

        // resolve component provider
        if (!hasComponentProvider) {
            if (parentDescribeRunner) {
                const parentReactExtension = ReactExtension
                    .getReactExtension(parentDescribeRunner.getClass());
                // parent has component provider, use it
                if (parentReactExtension?.getComponentService().isComponentProviderRegistered()) {
                    reactExtension
                        .getComponentService()
                        .registerComponentProvider(
                            parentReactExtension.getComponentService().componentProvider.name,
                            parentReactExtension.getComponentService().componentProvider.source
                        );

                    // inherit default props
                    const defaultProps = parentReactExtension.getComponentService().componentProvider.defaultProps;
                    if (defaultProps && !reactExtension.getComponentService().componentProvider.defaultProps) {
                        reactExtension
                            .getComponentService()
                            .registerDefaultProps(defaultProps);
                    }
                }
            } else {
                // no component provider at all
                return;
            }
        }

        const componentDataProviderFn = this.createComponentDataProviderFn(describeRunner);
        const defaultProps = reactExtension
            .getComponentService()
            .createAndGetDefaultProps(describeRunner.getClassInstance());

        // update existing data providers, add react component
        // if parent's runner is ReactTestRunner
        // then react component already been registered
        if (
            (
                !parentDescribeRunner
                || !(parentDescribeRunner.getTestRunner() instanceof ReactTestRunner)
            )
            && testsService.getDataProviders().length
        ) {
            const componentPromise = componentDataProviderFn(defaultProps)
                .then(([comp]) => comp);
            for (const providerName of testsService.getDataProviders()) {
                const providerDataWithReactComponent = [];
                const providerData = testsService.getDataProvider(providerName);
                for (const providerDataUnit of this.enrichWithDefaultProps(defaultProps, providerData)) {
                    providerDataWithReactComponent.push(isArray(providerDataUnit)
                        ? [componentPromise, ...providerDataUnit]
                        : [componentPromise, providerDataUnit]
                    );
                }
                testsService.registerDataProvider(providerName, providerDataWithReactComponent);
            }
        }

        testsService.registerPreProcessor(this.registerComponentProviderPreprocessor(
            describeRunner,
            componentDataProviderFn,
            defaultProps
        ));

        testsService.registerPreProcessor(this.registerWithStatePreprocessor(describeRunner));
    }

    private registerComponentProviderPreprocessor(
        describeRunner: IDescribeRunner,
        componentDataProviderFn: (arg: object | object[], defaultProps?: object) => Promise<any[]>,
        defaultProps?: object
    ): PreProcessor {
        const reactExtension = ReactTestRunner.getReactExtension(describeRunner);

        return async (data: PreProcessorData): Promise<PreProcessorData> => ({
            ...data,
            args: await this.getArgsArrayWithReactDataProviders(
                data.args,
                data.testEntity,
                reactExtension,
                componentDataProviderFn,
                defaultProps
            ),
        });
    }

    private registerWithStatePreprocessor(describeRunner: IDescribeRunner): PreProcessor {
        const reactExtension = ReactTestRunner.getReactExtension(describeRunner);
        return async (data: PreProcessorData): Promise<PreProcessorData> => {
            const stateDataProvider = reactExtension.getWithState(data.testEntity.name as string);
            let wrapper: ReactWrapper;
            if (stateDataProvider && data.args[0]) {
                await new Promise((resolve) => {
                    wrapper = (data.args[0] as ReactWrapper).setState(stateDataProvider, resolve);
                });
                const [_, ...restArgs] = data.args;
                return { ...data, args: [wrapper || data.args[0], stateDataProvider, ...restArgs] };
            }
            return data;
        };
    }

    private async getArgsArrayWithReactDataProviders(
        args: any[],
        testEntity: TestEntity,
        reactExtension: IReactExtension,
        componentDataProviderFn: (arg: object | object[], defaultProps?: object) => Promise<any[]>,
        defaultProps?: object
    ): Promise<any[]> {
        const propsDataProvider = reactExtension.getWithProps(testEntity.name as string);
        const hasDataProviders = Boolean(testEntity.dataProviders.length);
        if (hasDataProviders) {
            // if entity has data providers, means that @WithDataProvider already been declared
            // currently, only @WithDataProvider or @WithProps is supported
            if (propsDataProvider) {
                throw new SyntaxError("Currently, only @WithDataProvider or @WithProps is supported per test at one time");
            }
            return args;
        }
        return propsDataProvider
            ? await componentDataProviderFn(propsDataProvider, defaultProps)
            : await componentDataProviderFn(defaultProps);
    }

    private createComponentDataProviderFn(
        describeRunner: IDescribeRunner
    ): (arg: object | object[], defaultProps?: object) => Promise<any[]> {
        const reactExtension = ReactTestRunner.getReactExtension(describeRunner);
        const clazzInstance = describeRunner.getClassInstance();
        const componentService = reactExtension.getComponentService();
        const componentProvider = componentService.getComponentProvider();

        const callProviderMethodAct = async (component: any, props: object) => {
            const comp = async () => await clazzInstance[componentProvider.name]
                .apply(clazzInstance, [component, ...isArray(props) ? props : [props]]);
            if (componentProvider.isAct) {
                return await componentService.runWithAct(comp, [], componentProvider.isAsyncAct);
            }
            return await comp();
        };
        const componentPromiseFn = (props: object = {}) => new Promise(resolve =>
            componentService
                .importOrGetComponent()
                .then(importedComponent =>
                    callProviderMethodAct(importedComponent, props)
                        .then(resolve)));

        return async (dataProvider: object | object[], defaultProps: object): Promise<any[]> => {
            const enrichedDataProvider = defaultProps
                ? this.enrichWithDefaultProps(defaultProps, dataProvider, true)
                : dataProvider;
            // if no component source to import - just pass dataProvider
            if (!Boolean(componentProvider.source)) {
                return isArray(enrichedDataProvider)
                    ? enrichedDataProvider
                    : [enrichedDataProvider];
            }
            // otherwise - pass dataProvider among with imported component
            return isArray(enrichedDataProvider)
                ? await Promise.all(enrichedDataProvider.map(async dataProviderEntry => {
                    const enrichedDataProviderEntry = defaultProps
                        ? this.enrichWithDefaultProps(defaultProps, dataProviderEntry, true)
                        : dataProviderEntry;
                    return [
                        await componentPromiseFn(enrichedDataProviderEntry),
                        ...isArray(enrichedDataProviderEntry)
                            ? enrichedDataProviderEntry
                            : [enrichedDataProviderEntry],
                    ];
                }))
                : [await componentPromiseFn(enrichedDataProvider), enrichedDataProvider];
        };
    }

    private enrichWithDefaultProps(
        defaultProps: object,
        dataProvider: object | object[],
        merge: boolean = false
    ): any {
        if (isArray(dataProvider)) {
            return dataProvider.map(dataProviderEntry => {
                if (isArray(dataProviderEntry)) {
                    return [defaultProps, ...dataProviderEntry];
                }
                if (isObject(dataProvider) && merge) {
                    return { ...defaultProps, ...dataProviderEntry };
                }
                return [defaultProps, dataProviderEntry];
            });
        }
        if (isObject(dataProvider) && merge) {
            return { ...defaultProps, ...dataProvider };
        }
        return [defaultProps, dataProvider];
    };
}
