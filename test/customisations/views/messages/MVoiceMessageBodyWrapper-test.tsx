/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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

import React from "react";
import { render, screen } from "@testing-library/react";

import MVoiceMessageBodyWrapper
    from "../../../../src/customisations/components/views/messages/MVoiceMessageBodyWrapper";
import { IBodyProps } from "../../../../src/components/views/messages/IBodyProps";

jest.mock(
    "../../../../src/components/views/messages/MVoiceMessageBody",
    () => ({
        __esModule: true,
        default: (props) => (<div>test { props.a }</div>),
    }),
);

describe("MVoiceMessageBodyWrapper", () => {
    beforeEach(() => {
        render(<MVoiceMessageBodyWrapper {...{ a: "MVoiceMessageBody" } as unknown as IBodyProps} />);
    });

    it("should render MVoiceMessageBody", () => {
        screen.getByText("test MVoiceMessageBody");
    });
});
