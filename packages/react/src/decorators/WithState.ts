import { Class } from "@jest-decorated/shared";

import ReactExtension from "../modules/ReactExtension";

export function WithState(state: object) {
    return function WithStateDecoratorFunc(proto: object, methodName: string) {
        const reactExtension = ReactExtension.getReactExtension(proto.constructor as Class);

        reactExtension
            .registerWithState(methodName, state);
    };
}
