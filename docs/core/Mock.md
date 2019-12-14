# @Mock, @AutoClearedMock

The same as `jest.doMock`.

Will register mocks right in the start of the `@Describe()` suite (before hooks or `@LazyImport`).

Will `jest.umock` module in `afterAll` hook.

`@AutoClearedMock` is the same as `@Mock`, but it will be cleared after each test.

Mock will become accessible inside class methods via `this.annotatedPropertyName`.

## Arguments

`pathToMock (String)`: Path to the module, which will be mocked.

`mockImplementation (Object | () => any)?`: Optional, otherwise - decorated method's implementation will be taken. 

`options (jest.MockOptions)?`: Optional. Jest mock options.

## Examples

### Common usage:

From:

```javascript
jest.mock("../module");

describe("MySpec", () => {
    
    afterAll(() => {
        jest.unmock("../module");
    });
});
```

To:

```javascript
@Describe()
class MySpec {
    
    @Mock("../module")
    myMock;
}
```

### Usage with implementation:

From:

```javascript
jest.mock("../module", () => ({ myVal: "foo" }));

describe("MySpec", () => {
    
    afterAll(() => {
        jest.unmock("../module");
    });
    
    // ...
});
```

To:

```javascript
@Describe()
class MySpec {
    
    @Mock("../module", () => ({ myVal: "foo" }))
    myMock;
    
    // or
    
    @Mock("../module", { myVal: "foo" })
    myMock;
    
    // or
    
    @Mock("../module")
    myMock = () => ({ myVal: "foo" });
    
    // or
    
    @Mock("../module")
    myMock = { myVal: "foo" };
    
    // or
    
    @Mock("../module")
    myMock() {
        return { myVal: "foo" };
    }
}
```

### Usage with options:

From:

```javascript
jest.mock("../module", () => ({ myVal: "foo" }), { virtual: true });

describe("MySpec", () => {
    
    afterAll(() => {
        jest.unmock("../module");
    });
    
    // ...
});
```

To:

```javascript
@Describe()
class MySpec {
    
    @Mock("../module", { virtual: true })
    myMock = { myVal: "foo" };
}
```

### AutoClearedMock:

From:

```javascript
jest.mock("../module", () => ({
    myFn: jest.fn()
}));

import { myFn } from "../module";

describe("MySpec", () => {
    
    afterEach(() => {
        myFn.mockClear();
    });
    
    afterAll(() => {
        jest.unmock("../module");
    });
    
    // ...
});
```

To:

```javascript
import { myFn } from "../module";

@Describe()
class MySpec {
    
    @AutoClearedMock("../module")
    myMock = { myFn: jest.fn() };
    
    // ...
}
```