import { ComponentStore, IReactExtension, ITestsService, resolveModule } from "@jest-decorated/shared";

export class StoreService {

    public readonly defaultStore: Partial<ComponentStore> = {};

    private readonly withStoreRegistry: Map<PropertyKey, ComponentStore> = new Map();

    public registerDefaultStore(defaultStore: ComponentStore): void {
        this.defaultStore.value = defaultStore.value;
        this.defaultStore.lib = defaultStore.lib;
    }

    public registerWithStore(methodName: PropertyKey, store: ComponentStore): void {
        this.withStoreRegistry.set(methodName, store);
    }

    public inheritDefaultStore(parentReactExtension?: IReactExtension): void {
        const parentDefaultStore = parentReactExtension?.getStoreService().defaultStore;
        if (!this.defaultStore.lib && parentDefaultStore?.lib) {
            this.registerDefaultStore(parentDefaultStore);
        }
    }

    public registerStoreProcessor(testsService: ITestsService): void {
        // no store at all
        if (!this.defaultStore.lib && !this.withStoreRegistry.size) {
            return;
        }
        // we assume that if any store of Describe has lib "A" -> all of the stores have lib "A"
        const expectedLib = this.defaultStore.lib ?? [...this.withStoreRegistry.values()][0].lib;
        switch (expectedLib) {
            case "redux":
                this.registerReduxStore(testsService);
                return;
        }
    }

    private registerReduxStore(testsService: ITestsService): void {
        testsService.registerPreProcessor(
            ({ clazzInstance, testEntity, args }) => {
                const reactDOM = resolveModule("mock-redux-store");
            },
            -10
        );
    }
}
