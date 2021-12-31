/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { useState } from "react";

export const useLocalEcho = <T>(
    currentFactory: () => T,
    setterFn: (value: T) => Promise<unknown>,
    errorFn: (error: Error) => void,
): [value: T, handler: (value: T) => void] => {
    const [value, setValue] = useState(currentFactory);
    const handler = async (value: T) => {
        setValue(value);
        try {
            await setterFn(value);
        } catch (e) {
            setValue(currentFactory());
            errorFn(e);
        }
    };

    return [value, handler];
};
