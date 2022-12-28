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
import userEvent from "@testing-library/user-event";
import { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import BasicMessageComposer from "../../../../src/components/views/rooms/BasicMessageComposer";
import * as TestUtils from "../../../test-utils";
import { MatrixClientPeg } from "../../../../src/MatrixClientPeg";
import EditorModel from "../../../../src/editor/model";
import { createPartCreator, createRenderer } from "../../../editor/mock";

describe("BasicMessageComposer", () => {
    const renderer = createRenderer();
    const pc = createPartCreator();

    beforeEach(() => {
        TestUtils.stubClient();
    });

    it("should allow a user to paste a URL without it being mangled", () => {
        const model = new EditorModel([], pc, renderer);
        const client: MatrixClient = MatrixClientPeg.get();

        const roomId = "!1234567890:domain";
        const userId = client.getUserId();
        const room = new Room(roomId, client, userId);

        const testUrl = "https://element.io";
        const mockDataTransfer = generateMockDataTransferForString(testUrl);

        render(<BasicMessageComposer model={model} room={room} />);
        userEvent.paste(mockDataTransfer);

        expect(model.parts).toHaveLength(1);
        expect(model.parts[0].text).toBe(testUrl);
        expect(screen.getByText(testUrl)).toBeInTheDocument();
    });
});

function generateMockDataTransferForString(string): DataTransfer {
    return {
        getData: (type) => {
            if (type === "text/plain") {
                return string;
            }
        },
        dropEffect: "link",
        effectAllowed: "link",
        files: undefined,
        items: undefined,
        types: [],
        clearData: function (format?: string): void {
            throw new Error("Function not implemented.");
        },
        setData: function (format: string, data: string): void {
            throw new Error("Function not implemented.");
        },
        setDragImage: function (image: Element, x: number, y: number): void {
            throw new Error("Function not implemented.");
        },
    };
}
