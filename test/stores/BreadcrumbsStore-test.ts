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

import { mocked } from "jest-mock";
import { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { createTestClient, setupAsyncStoreWithClient } from "../test-utils";
import SettingsStore from "../../src/settings/SettingsStore";
import { BreadcrumbsStore } from "../../src/stores/BreadcrumbsStore";

describe("BreadcrumbsStore", () => {
    let store: BreadcrumbsStore;
    const client: MatrixClient = createTestClient();

    beforeEach(() => {
        jest.resetAllMocks();
        store = BreadcrumbsStore.instance;
        setupAsyncStoreWithClient(store, client);
    });

    describe("If the feature_breadcrumbs_v2 feature is not enabled", () => {
        beforeEach(() => {
            jest.spyOn(SettingsStore, "getValue").mockReturnValue(false);
        });

        it("does not meet room requirements if there are not enough rooms", () => {
            // We don't have enough rooms, so we don't meet requirements
            mocked(client.getVisibleRooms).mockReturnValue(fakeRooms(2));
            expect(store.meetsRoomRequirement).toBe(false);
        });

        it("meets room requirements if there are enough rooms", () => {
            // We do have enough rooms to show breadcrumbs
            mocked(client.getVisibleRooms).mockReturnValue(fakeRooms(25));
            expect(store.meetsRoomRequirement).toBe(true);
        });
    });

    describe("If the feature_breadcrumbs_v2 feature is enabled", () => {
        beforeEach(() => {
            // Turn on feature_breadcrumbs_v2 setting
            jest.spyOn(SettingsStore, "getValue").mockImplementation(
                (settingName) => settingName === "feature_breadcrumbs_v2",
            );
        });

        it("always meets room requirements", () => {
            // With enough rooms, we meet requirements
            mocked(client.getVisibleRooms).mockReturnValue(fakeRooms(25));
            expect(store.meetsRoomRequirement).toBe(true);

            // And even with not enough we do, because the feature is enabled.
            mocked(client.getVisibleRooms).mockReturnValue(fakeRooms(2));
            expect(store.meetsRoomRequirement).toBe(true);
        });
    });

    /**
     * Create as many fake rooms in an array as you ask for.
     */
    function fakeRooms(howMany: number): Array<Room> {
        const ret = [];
        for (let i = 0; i < howMany; i++) {
            ret.push(fakeRoom());
        }
        return ret;
    }

    let roomIdx = 0;

    function fakeRoom(): Room {
        roomIdx++;
        return new Room(`room${roomIdx}`, client, "@user:example.com");
    }
});
