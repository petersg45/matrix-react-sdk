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

import React from 'react';
import { mount } from 'enzyme';
import { MatrixClient } from 'matrix-js-sdk/src/client';
import { EventType } from "matrix-js-sdk/src/@types/event";
import { act } from "react-dom/test-utils";
import { mocked } from 'jest-mock';

import SpaceStore from "../../../../src/stores/spaces/SpaceStore";
import { MetaSpace } from "../../../../src/stores/spaces";
import RoomListHeader from "../../../../src/components/views/rooms/RoomListHeader";
import * as testUtils from "../../../test-utils";
import { createTestClient, mkSpace } from "../../../test-utils";
import DMRoomMap from "../../../../src/utils/DMRoomMap";
import MatrixClientContext from "../../../../src/contexts/MatrixClientContext";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { SettingLevel } from "../../../../src/settings/SettingLevel";
import { shouldShowComponent } from '../../../../src/customisations/helpers/UIComponents';
import { UIComponent } from '../../../../src/settings/UIFeature';

jest.mock('../../../../src/customisations/helpers/UIComponents', () => ({
    shouldShowComponent: jest.fn(),
}));

const blockUIComponent = component => {
    mocked(shouldShowComponent).mockImplementation(feature => feature !== component);
};

const setupSpace = (client) => {
    const testSpace = mkSpace(client, "!space:server");
    testSpace.name = "Test Space";
    client.getRoom = () => testSpace;
    return testSpace;
};

const setupMenu = async (client, testSpace) => {
    const getUserIdForRoomId = jest.fn();
    const getDMRoomsForUserId = jest.fn();
    // @ts-ignore
    DMRoomMap.sharedInstance = { getUserIdForRoomId, getDMRoomsForUserId };

    await testUtils.setupAsyncStoreWithClient(SpaceStore.instance, client);
    act(() => {
        SpaceStore.instance.setActiveSpace(testSpace.roomId);
    });

    const wrapper = mount(<MatrixClientContext.Provider value={client}>
        <RoomListHeader />
    </MatrixClientContext.Provider>);

    expect(wrapper.text()).toBe("Test Space");
    act(() => {
        wrapper.find('[aria-label="Test Space menu"]').hostNodes().simulate("click");
    });
    wrapper.update();

    return wrapper;
};

describe("RoomListHeader", () => {
    let client: MatrixClient;

    beforeEach(() => {
        client = createTestClient();
        mocked(shouldShowComponent).mockReturnValue(true); // show all UIComponents
    });

    it("renders a main menu for the home space", () => {
        act(() => {
            SpaceStore.instance.setActiveSpace(MetaSpace.Home);
        });

        const wrapper = mount(<MatrixClientContext.Provider value={client}>
            <RoomListHeader />
        </MatrixClientContext.Provider>);

        expect(wrapper.text()).toBe("Home");
        act(() => {
            wrapper.find('[aria-label="Home options"]').hostNodes().simulate("click");
        });
        wrapper.update();

        const menu = wrapper.find(".mx_IconizedContextMenu");
        const items = menu.find(".mx_IconizedContextMenu_item").hostNodes();
        expect(items).toHaveLength(1);
        expect(items.at(0).text()).toBe("Show all rooms");
    });

    it("renders a main menu for spaces", async () => {
        const testSpace = setupSpace(client);
        const wrapper = await setupMenu(client, testSpace);

        const menu = wrapper.find(".mx_IconizedContextMenu");
        const items = menu.find(".mx_IconizedContextMenu_item").hostNodes();
        expect(items).toHaveLength(6);
        expect(items.at(0).text()).toBe("Space home");
        expect(items.at(1).text()).toBe("Manage & explore rooms");
        expect(items.at(2).text()).toBe("Preferences");
        expect(items.at(3).text()).toBe("Settings");
        expect(items.at(4).text()).toBe("Room");
        // Look for label within the item, to ignore the text of the "Beta" pill if present.
        expect(items.at(5).find(".mx_IconizedContextMenu_label").text()).toBe("Space");
    });

    it("closes menu if space changes from under it", async () => {
        await SettingsStore.setValue("Spaces.enabledMetaSpaces", null, SettingLevel.DEVICE, {
            [MetaSpace.Home]: true,
            [MetaSpace.Favourites]: true,
        });

        const testSpace = setupSpace(client);
        const wrapper = await setupMenu(client, testSpace);

        act(() => {
            SpaceStore.instance.setActiveSpace(MetaSpace.Favourites);
        });
        wrapper.update();

        expect(wrapper.text()).toBe("Favourites");

        const menu = wrapper.find(".mx_IconizedContextMenu");
        expect(menu).toHaveLength(0);
    });

    describe('UIComponents', () => {
        it('does not render Add Space when user does not have permission to add spaces', async () => {
            // User does not have permission to add spaces, anywhere
            blockUIComponent(UIComponent.CreateSpaces);

            const testSpace = setupSpace(client);
            const wrapper = await setupMenu(client, testSpace);

            const menu = wrapper.find(".mx_IconizedContextMenu");
            const items = menu.find(".mx_IconizedContextMenu_item").hostNodes();
            expect(items).toHaveLength(5);
            expect(items.at(0).text()).toBe("Space home");
            expect(items.at(1).text()).toBe("Manage & explore rooms");
            expect(items.at(2).text()).toBe("Preferences");
            expect(items.at(3).text()).toBe("Settings");
            expect(items.at(4).text()).toBe("Room");
        });

        it('does not render Add Room when user does not have permission to add rooms', async () => {
            // User does not have permission to add rooms
            blockUIComponent(UIComponent.CreateRooms);

            const testSpace = setupSpace(client);
            const wrapper = await setupMenu(client, testSpace);

            const menu = wrapper.find(".mx_IconizedContextMenu");
            const items = menu.find(".mx_IconizedContextMenu_item").hostNodes();
            expect(items).toHaveLength(5);
            expect(items.at(0).text()).toBe("Space home");
            expect(items.at(1).text()).toBe("Explore rooms");
            expect(items.at(2).text()).toBe("Preferences");
            expect(items.at(3).text()).toBe("Settings");
            // Look for label within the item, to ignore the text of the "Beta" pill if present.
            expect(items.at(4).find(".mx_IconizedContextMenu_label").text()).toBe("Space");
        });
    });

    describe('adding children to space', () => {
        it('if user cannot add children to space, buttons are disabled', async () => {
            const testSpace = setupSpace(client);
            // mocked(testSpace.currentState.maySendStateEvent).mockReturnValue(false);
            mocked(testSpace.currentState.maySendStateEvent).mockImplementation(
                (stateEventType, userId) => stateEventType !== EventType.SpaceChild);

            const wrapper = await setupMenu(client, testSpace);

            const menu = wrapper.find(".mx_IconizedContextMenu");
            const items = menu.find(".mx_IconizedContextMenu_item").hostNodes();
            expect(items).toHaveLength(4);
            expect(items.at(0).text()).toBe("Space home");
            expect(items.at(1).text()).toBe("Explore rooms");
            expect(items.at(2).text()).toBe("Preferences");
            expect(items.at(3).text()).toBe("Settings");
        });
    });
});
