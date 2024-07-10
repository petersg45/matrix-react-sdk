/*
Copyright 2023 The Matrix.org Foundation C.I.C.

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

import { Room } from "matrix-js-sdk/src/matrix";

import { isManagedHybridWidgetEnabled } from "../../src/widgets/ManagedHybrid";
import { stubClient } from "../test-utils";
import SdkConfig from "../../src/SdkConfig";

jest.mock("../../src/utils/room/getJoinedNonFunctionalMembers", () => ({
    getJoinedNonFunctionalMembers: jest.fn().mockReturnValue([1, 2]),
}));

describe("isManagedHybridWidgetEnabled", () => {
    let room: Room;

    beforeEach(() => {
        const client = stubClient();
        room = new Room("!room:server", client, client.getSafeUserId());
    });

    it("should return false if widget_build_url is unset", () => {
        expect(isManagedHybridWidgetEnabled(room)).toBeFalsy();
    });

    it("should return true for 1-1 rooms when widget_build_url_ignore_dm is unset", () => {
        SdkConfig.put({
            widget_build_url: "https://url",
        });
        expect(isManagedHybridWidgetEnabled(room)).toBeTruthy();
    });

    it("should return false for 1-1 rooms when widget_build_url_ignore_dm is true", () => {
        SdkConfig.put({
            widget_build_url: "https://url",
            widget_build_url_ignore_dm: true,
        });
        expect(isManagedHybridWidgetEnabled(room)).toBeFalsy();
    });
});
