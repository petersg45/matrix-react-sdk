/*
Copyright 2023 Suguru Hirahara

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

/// <reference types="cypress" />

import { MatrixClient } from "matrix-js-sdk/src/matrix";
import { EventType } from "matrix-js-sdk/src/@types/event";

import { HomeserverInstance } from "../../plugins/utils/homeserver";
import { SettingLevel } from "../../../src/settings/SettingLevel";

describe("LeftPanel", () => {
    let homeserver: HomeserverInstance;
    const roomName = "Test Room";
    const spaceName = "Test Space";

    beforeEach(() => {
        cy.startHomeserver("default").then((data) => {
            homeserver = data;

            cy.initTestUser(homeserver, "Hanako");
        });

        cy.get(".mx_LeftPanel").should("exist");
    });

    afterEach(() => {
        cy.stopHomeserver(homeserver);
    });

    describe("for filter container", () => {
        it("should display spotlight dialog by clicking trigger", () => {
            // Assert the filter container is rendered
            cy.get(".mx_LeftPanel_filterContainer").within(() => {
                // Force click as Notification toast covers the button on Cypress Cloud
                cy.get(".mx_RoomSearch_spotlightTrigger").click({ force: true });
            });

            cy.findByRole("dialog", { name: "Search Dialog" }).should("exist");
        });

        it("should display spotlight dialog by clicking 'Explore rooms' button", () => {
            cy.get(".mx_LeftPanel_filterContainer").within(() => {
                cy.findByRole("button", { name: "Explore rooms" }).click();
            });

            cy.findByRole("dialog", { name: "Search Dialog" }).within(() => {
                // Assert that the spotlight dialog for searching public rooms
                cy.get(".mx_SpotlightDialog_filterPublicRooms").should("exist");
            });
        });

        it("should display v2 breadcrumbs", () => {
            cy.setSettingValue("feature_breadcrumbs_v2", null, SettingLevel.DEVICE, true);

            cy.get(".mx_LeftPanel_filterContainer").within(() => {
                // Assert that the v2 breadcrumbs are rendered
                cy.findByTitle("Recently viewed").should("exist");
            });
        });
    });

    describe("for room list header", () => {
        beforeEach(() => {
            // Assert the room list header is rendered
            cy.get(".mx_RoomListHeader").within(() => {
                // Assert that the default menu name is rendered
                cy.findByRole("button", { name: "Home options" }).should("exist");
            });
        });

        describe("for a created Space", () => {
            beforeEach(() => {
                // Create a room
                cy.createRoom({ name: roomName }).as("roomId1");

                // Create a Space and add the room to it
                cy.get<string>("@roomId1").then((roomId1) => {
                    cy.createSpace({
                        name: spaceName,
                        initial_state: [
                            {
                                type: "m.space.child",
                                state_key: roomId1,
                                content: {
                                    via: roomId1,
                                },
                            },
                        ],
                    });
                });
            });

            it("should switch menu names", () => {
                cy.get(".mx_RoomListHeader").within(() => {
                    // Assert that the button with the name "Home options" is rendered
                    cy.findByRole("button", { name: "Home options" }).should("exist");
                });

                // Click the created Space's button on SpacePanel
                cy.get(".mx_SpacePanel").within(() => {
                    cy.findByRole("button", { name: spaceName }).click();
                });

                cy.get(".mx_RoomListHeader").within(() => {
                    // Assert that menu name was replaced
                    cy.findByRole("button", { name: `${spaceName} menu` }).should("exist");
                });
            });

            it("should render context menu by clicking the menu button", () => {
                cy.get(".mx_SpacePanel").within(() => {
                    cy.findByRole("button", { name: spaceName }).click();
                });

                cy.get(".mx_RoomListHeader").within(() => {
                    // Click the menu button on the header
                    // Force click as Notification toast covers the button on Cypress Cloud
                    cy.findByRole("button", { name: `${spaceName} menu` }).click({ force: true });
                });

                // Assert that context menu for Space is rendered
                cy.findByRole("menu").within(() => {
                    cy.findByRole("menuitem", { name: "Space home" }).should("exist");
                });
            });

            it("should render a room tile by clicking 'Show all rooms' context menu", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert the room tile is not rendered
                    cy.findByRole("treeitem", { name: roomName }).should("not.exist");
                });

                cy.get(".mx_RoomListHeader").within(() => {
                    // Force click as "Home options" button is hidden by "Notifications" toast on Cypress Cloud
                    cy.findByRole("button", { name: "Home options" }).click({ force: true });
                });

                // Click "Show all rooms" on the context menu
                cy.findByRole("menuitemcheckbox", { name: "Show all rooms" }).click();

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert the room tile is rendered
                    cy.findByRole("treeitem", { name: roomName }).should("exist");
                });
            });
        });
    });

    describe("for room list wrapper", () => {
        let bot: MatrixClient;
        const botName = "BotBob";
        const message = "Message";

        const createBotDM = () => {
            // Create a bot
            cy.getBot(homeserver, { displayName: botName }).then((_bot) => {
                bot = _bot;
            });

            // Create DM with the bot
            cy.getClient().then(async (cli) => {
                const botRoom = await cli.createRoom({ is_direct: true });
                await cli.invite(botRoom.room_id, bot.getUserId());
                await cli.setAccountData("m.direct" as EventType, {
                    [bot.getUserId()]: [botRoom.room_id],
                });
            });
        };

        beforeEach(() => {
            cy.get(".mx_LeftPanel_roomListWrapper").should("exist");
        });

        it("should sort rooms by activity and alphabetically", () => {
            const room1Name = "Test Room A";
            const room2Name = "Test Room B";
            let roomId: string;

            cy.getBot(homeserver, { displayName: "BotBob", autoAcceptInvites: false }).then((_bot) => {
                bot = _bot;
            });

            // Create a empty room
            cy.createRoom({ name: room1Name });

            // Create another room where invited bot sends a message
            cy.createRoom({ name: room2Name })
                .then((_roomId) => {
                    roomId = _roomId;
                    return cy.inviteUser(roomId, bot.getUserId());
                })
                .then(async () => {
                    await bot.joinRoom(roomId);
                    bot.sendMessage(roomId, { body: `This is a message to ${room2Name}`, msgtype: "m.text" });
                });

            cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                // Assert that the second room is rendered above the first room
                cy.get(".mx_RoomTile").first().contains(room2Name).should("exist");
                cy.get(".mx_RoomTile").last().contains(room1Name).should("exist");

                cy.findByRole("treeitem", { name: "Rooms" })
                    .realHover()
                    .findByRole("button", { name: "List options" })
                    .click();
            });

            // Force click because the size of the checkbox is zero
            cy.findByLabelText("A-Z").click({ force: true });

            // Foce click to close the context menu
            cy.get(".mx_ContextualMenu_background").click({ force: true });

            // Assert the context menu was closed
            cy.get(".mx_ContextualMenu").should("not.exist");

            cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                // Assert that the first room (Test Room A) is rendered above the second room (Test Room B)
                cy.get(".mx_RoomTile").first().contains(room1Name).should("exist");
                cy.get(".mx_RoomTile").last().contains(room2Name).should("exist");

                cy.findByRole("treeitem", { name: "Rooms" })
                    .realHover()
                    .findByRole("button", { name: "List options" })
                    .click();
            });

            // Force click because the size of the checkbox is zero
            cy.findByLabelText("Show rooms with unread messages first").click({ force: true });

            // TODO Uncomment once https://github.com/vector-im/element-web/issues/25553 is fixed
            // cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
            //    cy.get(".mx_RoomTile").first().contains(room2Name).should("exist");
            //    cy.get(".mx_RoomTile").last().contains(room1Name).should("exist");
            // });
        });

        it("should hide and unhide the room tile by clicking the list header", () => {
            cy.createRoom({ name: roomName });

            cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                // Assert the room tile is rendered by default
                cy.findByRole("treeitem", { name: roomName }).should("exist");

                // Click the header to hide the room tile
                cy.findByRole("button", { name: "Rooms" }).click();
                cy.findByRole("treeitem", { name: roomName }).should("not.exist");

                // Click again to redisplay the room tile
                cy.findByRole("button", { name: "Rooms" }).click();
                cy.findByRole("treeitem", { name: roomName }).should("exist");
            });
        });

        it("should display a room name and message preview regardless of font size setting", () => {
            // Minimize the font size with the slider on Appearance user settings tab
            const minimizeFontSize = () => {
                cy.openUserSettings("Appearance");
                cy.get(".mx_FontScalingPanel_fontSlider").within(() => {
                    // Click the left position of the slider
                    cy.get("input").realClick({ position: "left" });
                });
                cy.closeDialog();
            };

            // Maximize the font size with the slider on Appearance user settings tab
            const maximizeFontSize = () => {
                cy.openUserSettings("Appearance");
                cy.get(".mx_FontScalingPanel_fontSlider").within(() => {
                    // Click the right position of the slider
                    cy.get("input").realClick({ position: "right" });
                });
                cy.closeDialog();
            };

            // Assert that the room name and the preview are visible on the room tile
            const checkVisibility = () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Rooms" }).within(() => {
                        cy.get(".mx_RoomTile_title").findByText(roomName).should("be.visible");
                        cy.get(".mx_RoomTile_subtitle").findByText(message).should("be.visible");
                    });
                });
            };

            // Create a room and send a message to it
            cy.createRoom({ name: roomName })
                .as("roomId1")
                .then((roomId1) => {
                    cy.sendEvent(roomId1, null, "m.room.message" as EventType, {
                        msgtype: "m.text",
                        body: message,
                    });
                });

            // Enable message preview
            cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                cy.findByRole("treeitem", { name: "Rooms" })
                    .realHover()
                    .findByRole("button", { name: "List options" })
                    .click();
            });

            // Force click because the size of the checkbox is zero
            cy.findByLabelText("Show previews of messages").click({ force: true });

            // Foce click to close the context menu
            cy.get(".mx_ContextualMenu_background").click({ force: true });

            // Assert the context menu was closed
            cy.get(".mx_ContextualMenu").should("not.exist");

            minimizeFontSize();

            checkVisibility();

            maximizeFontSize();

            checkVisibility();
        });

        describe("for Saved Items", () => {
            beforeEach(() => {
                // Enable Favorites
                cy.setSettingValue("feature_favourite_messages", null, SettingLevel.DEVICE, true);
            });

            it("should render a sublist", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Saved Items" }).within(() => {
                        cy.findByRole("treeitem", { name: "Favourite Messages" }).should("exist");
                    });
                });
            });
        });

        describe("for Favorites", () => {
            beforeEach(() => {
                cy.createRoom({ name: roomName });

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Rooms" }).within(() => {
                        cy.findByRole("treeitem", { name: roomName })
                            .realHover()
                            .findByRole("button", { name: "Room options" })
                            .click();
                    });
                });

                // Click "Favorite" on the context menu
                cy.findByRole("menuitemcheckbox", { name: "Favourite" }).click();

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert that the favorite room list was rendered
                    cy.findByRole("group", { name: "Favourites" }).should("exist");
                });
            });

            it("should render a sublist", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Favourites" }).within(() => {
                        cy.findByRole("treeitem", { name: roomName }).should("exist");
                    });
                });
            });
        });

        describe("for People", () => {
            beforeEach(() => {
                createBotDM();
            });

            it("should render a sublist", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "People" }).within(() => {
                        cy.findByRole("treeitem", { name: botName }).should("exist");
                    });
                });
            });
        });

        describe("for Rooms", () => {
            it("should render a sublist", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Rooms" }).within(() => {
                        // create rooms and check room names are correct
                        cy.createRoom({ name: "Apple" }).then(() => cy.findByRole("treeitem", { name: "Apple" }));
                        cy.createRoom({ name: "Pineapple" }).then(() =>
                            cy.findByRole("treeitem", { name: "Pineapple" }),
                        );
                        cy.createRoom({ name: "Orange" }).then(() => cy.findByRole("treeitem", { name: "Orange" }));
                    });
                });
            });
        });

        describe("for Historical", () => {
            // Create a room and leave it
            beforeEach(() => {
                cy.createRoom({ name: roomName });

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Rooms" }).within(() => {
                        // Assert the room tile is rendered by default
                        cy.findByRole("treeitem", { name: roomName })
                            .realHover()
                            .findByRole("button", { name: "Room options" })
                            .click();
                    });
                });

                cy.findByRole("menuitem", { name: "Leave" }).click();
                cy.findByRole("button", { name: "Leave" }).click();

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Wait until the user left the room
                    cy.findByRole("group", { name: "Historical" }).should("exist");
                });
            });

            it("should render a sublist", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert that the room is rendered in "Historical" sublist
                    cy.findByRole("group", { name: "Historical" }).within(() => {
                        cy.get(".mx_RoomTile").findByText(roomName);
                    });
                });
            });

            it("should support removing a left room", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert that the room is rendered in "Historical" sublist
                    cy.findByRole("group", { name: "Historical" }).within(() => {
                        cy.get(".mx_RoomTile").realHover().findByRole("button", { name: "Room options" }).click();
                    });
                });

                cy.findByRole("menuitem", { name: "Forget Room" }).click();

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert that the "Historical" sublist group is gone
                    cy.findByRole("group", { name: "Historical" }).should("not.exist");

                    // Assert that Skelton UI is rendered instead
                    cy.get(".mx_RoomSublist_skeletonUI").should("exist");
                });
            });
        });

        describe("for Low Priority", () => {
            beforeEach(() => {
                cy.createRoom({ name: roomName });

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Rooms" }).within(() => {
                        // Assert the room tile is rendered by default
                        cy.findByRole("treeitem", { name: roomName })
                            .realHover()
                            .findByRole("button", { name: "Room options" })
                            .click();
                    });
                });

                // Click "Low Prioirity" on the context menu
                cy.findByRole("menuitemcheckbox", { name: "Low Priority" }).click();

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Wait until the room is set to low priority
                    cy.findByRole("group", { name: "Low priority" }).should("exist");
                });
            });

            it("should render a sublist", () => {
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert that the room is rendered in "Low priority" sublist
                    cy.findByRole("group", { name: "Low priority" }).within(() => {
                        cy.get(".mx_RoomTile").findByText(roomName);
                    });
                });
            });
        });

        describe("for pre-built Spaces via Sidebar user settings tab", () => {
            beforeEach(() => {
                // Create a room
                cy.createRoom({ name: roomName }).as("roomId1");

                cy.openUserSettings("Sidebar");
            });

            it("should display and hide a room with Home and 'Show all rooms' settings enabled", () => {
                // Create a Space and add the room to it
                cy.get<string>("@roomId1").then((roomId1) => {
                    cy.createSpace({
                        name: spaceName,
                        initial_state: [
                            {
                                type: "m.space.child",
                                state_key: roomId1,
                                content: {
                                    via: roomId1,
                                },
                            },
                        ],
                    });
                });

                // Enable "Show all rooms"
                // Force click because the size of the checkbox is zero
                // Regex pattern due to double lines
                cy.findByLabelText(/Show all rooms/).click({ force: true });

                // Assert that the checkmark is visible
                cy.get(".mx_SidebarUserSettingsTab_homeAllRoomsCheckbox").within(() => {
                    cy.get(".mx_Checkbox_checkmark").should("be.visible");
                });

                cy.closeDialog();

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert the room tile is rendered
                    cy.findByRole("treeitem", { name: roomName }).should("exist");
                });

                // Re-open the user settings tab
                cy.openUserSettings("Sidebar");

                // Disable "Show all rooms"
                cy.findByLabelText(/Show all rooms/).click({ force: true });

                // Assert that the checkmark is not visible
                cy.get(".mx_SidebarUserSettingsTab_homeAllRoomsCheckbox").within(() => {
                    cy.get(".mx_Checkbox_checkmark").should("not.be.visible");
                });

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert the room tile is not rendered
                    cy.findByRole("treeitem", { name: roomName }).should("not.exist");
                });
            });

            it("should display favorite messages and rooms with Favorite enabled", () => {
                cy.findByTestId("Sidebar").within(() => {
                    // Force click because the size of the checkbox is zero
                    // Regex pattern due to double lines
                    cy.findByLabelText(/Favourites/).click({ force: true });
                });

                cy.closeDialog();

                // Assert the Space for favorites is enabled and the icon button for it is rendered in mx_SpacePanel
                cy.get(".mx_SpacePanel").within(() => {
                    cy.findByRole("button", { name: "Favourites" }).should("exist");
                });

                // Enable Favorites Messages
                cy.setSettingValue("feature_favourite_messages", null, SettingLevel.DEVICE, true);

                // Display the room options context menu
                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    cy.findByRole("group", { name: "Rooms" }).within(() => {
                        cy.get(".mx_RoomTile").realHover().findByRole("button", { name: "Room options" }).click();
                    });
                });

                // Click "Favorite" on the context menu
                cy.findByRole("menuitemcheckbox", { name: "Favourite" }).click();

                // Click the icon button on mx_SpacePanel
                cy.get(".mx_SpacePanel").within(() => {
                    cy.findByRole("button", { name: "Favourites" }).click();
                });

                cy.get(".mx_RoomListHeader").within(() => {
                    // Assert that the header title of Space for favorites is rendered
                    cy.get(".mx_RoomListHeader_contextLessTitle").findByText("Favourites");
                });

                cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                    // Assert that the room tile for favorite messages is rendered
                    cy.findByRole("group", { name: "Saved Items" }).within(() => {
                        cy.findByRole("treeitem", { name: "Favourite Messages" }).should("exist");
                    });

                    // Assert that the favorite room is rendered
                    cy.findByRole("group", { name: "Favourites" }).within(() => {
                        cy.findByRole("treeitem", { name: roomName }).should("exist");
                    });

                    // Assert there are not other room tiles on the room list
                    cy.get(".mx_RoomTile").should("have.length", 2);
                });
            });

            describe("with 'People' setting enabled", () => {
                beforeEach(() => {
                    createBotDM();

                    cy.findByTestId("Sidebar").within(() => {
                        // Force click because the size of the checkbox is zero
                        // Regex pattern due to double lines
                        cy.findByLabelText(/People/).click({ force: true });
                    });

                    cy.closeDialog();

                    // Assert the Space for People is enabled and the icon button for it is rendered in mx_SpacePanel
                    cy.get(".mx_SpacePanel").within(() => {
                        cy.findByRole("button", { name: "People" }).should("exist");
                    });

                    // Click the icon button for the Space for People
                    cy.get(".mx_SpacePanel").within(() => {
                        cy.findByRole("button", { name: "People" }).click();
                    });
                });

                it("should display the contact on the sublist", () => {
                    cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                        cy.findByRole("group", { name: "People" }).within(() => {
                            cy.findByRole("treeitem", { name: botName }).should("exist");
                        });

                        // Assert there are not other room tiles on the room list
                        cy.get(".mx_RoomTile").should("have.length", 1);
                    });
                });

                it("should render sublists for the contact and Saved Items", () => {
                    // Enable Favorites Messages
                    cy.setSettingValue("feature_favourite_messages", null, SettingLevel.DEVICE, true);

                    cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                        // Assert that the room tile for favorite messages is rendered
                        cy.findByRole("group", { name: "Saved Items" }).within(() => {
                            cy.findByRole("treeitem", { name: "Favourite Messages" }).should("exist");
                        });

                        cy.findByRole("group", { name: "People" }).within(() => {
                            cy.findByRole("treeitem", { name: botName }).should("exist");
                        });

                        // Assert there are not other room tiles on the room list
                        cy.get(".mx_RoomTile").should("have.length", 2);
                    });
                });
            });

            describe("with 'Rooms outside of a space' setting enabled", () => {
                beforeEach(() => {
                    cy.findByTestId("Sidebar").within(() => {
                        // Force click because the size of the checkbox is zero
                        // Regex pattern due to double lines
                        cy.findByLabelText(/Rooms outside of a space/).click({ force: true });
                    });

                    cy.closeDialog();

                    // Click the icon button on mx_SpacePanel
                    cy.get(".mx_SpacePanel").within(() => {
                        cy.findByRole("button", { name: "Other rooms" }).click();
                    });

                    cy.get(".mx_RoomListHeader").within(() => {
                        // Assert that the header title of Space for othe rooms is rendered
                        cy.get(".mx_RoomListHeader_contextLessTitle").findByText("Other rooms");
                    });
                });

                it("should display a room not a part of a Space", () => {
                    cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                        // Assert that the room tile for favorite messages is rendered
                        cy.findByRole("group", { name: "Rooms" }).within(() => {
                            cy.findByRole("treeitem", { name: roomName }).should("exist");
                        });
                    });
                });

                it("should not display a room which is a part of a Space", () => {
                    // Create a Space and add the room to it
                    cy.get<string>("@roomId1").then((roomId1) => {
                        cy.createSpace({
                            name: spaceName,
                            initial_state: [
                                {
                                    type: "m.space.child",
                                    state_key: roomId1,
                                    content: {
                                        via: roomId1,
                                    },
                                },
                            ],
                        });
                    });

                    cy.get(".mx_LeftPanel_roomListWrapper").within(() => {
                        // Assert that the room tile is not rendered
                        cy.findByRole("group", { name: "Rooms" }).within(() => {
                            cy.findByRole("treeitem", { name: roomName }).should("not.exist");
                        });

                        // Assert that Skelton UI is rendered instead
                        cy.get(".mx_RoomSublist_skeletonUI").should("exist");
                    });
                });
            });
        });
    });
});
