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

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mocked } from "jest-mock";
import { EventType, MatrixEvent, Room } from "matrix-js-sdk/src/matrix";

import dis from "../../../../src/dispatcher/dispatcher";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { RoomPredecessorTile } from "../../../../src/components/views/messages/RoomPredecessorTile";
import { stubClient, upsertRoomStateEvents } from "../../../test-utils/test-utils";
import { Action } from "../../../../src/dispatcher/actions";
import RoomContext from "../../../../src/contexts/RoomContext";
import { filterConsole, getRoomContext } from "../../../test-utils";
import { MatrixClientPeg } from "../../../../src/MatrixClientPeg";

jest.mock("../../../../src/dispatcher/dispatcher");

describe("<RoomPredecessorTile />", () => {
    const userId = "@alice:server.org";
    const roomId = "!room:server.org";
    stubClient();
    const client = mocked(MatrixClientPeg.get());

    function makeRoom({
        createEventHasPredecessor = false,
        predecessorEventExists = false,
        predecessorEventHasEventId = false,
        predecessorEventHasViaServers = false,
    }): Room {
        const room = new Room(roomId, client, userId);

        const createInfo = {
            type: EventType.RoomCreate,
            state_key: "",
            sender: userId,
            room_id: roomId,
            content: {},
            event_id: "$create",
        };

        if (createEventHasPredecessor) {
            createInfo.content = {
                predecessor: { room_id: "old_room_id", event_id: "$tombstone_event_id" },
            };
        }

        const createEvent = new MatrixEvent(createInfo);
        upsertRoomStateEvents(room, [createEvent]);

        if (predecessorEventExists) {
            const predecessorInfo = {
                type: EventType.RoomPredecessor,
                state_key: "",
                sender: userId,
                room_id: roomId,
                content: {
                    predecessor_room_id: "old_room_id_from_predecessor",
                    last_known_event_id: undefined,
                    via_servers: undefined,
                },
                event_id: "$predecessor",
            };

            if (predecessorEventHasEventId) {
                predecessorInfo.content.last_known_event_id = "$tombstone_event_id_from_predecessor";
            }
            if (predecessorEventHasViaServers) {
                predecessorInfo.content.via_servers = ["a.example.com", "b.example.com"];
            }

            const predecessorEvent = new MatrixEvent(predecessorInfo);
            upsertRoomStateEvents(room, [predecessorEvent]);
        }
        return room;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        mocked(dis.dispatch).mockReset();
        jest.spyOn(SettingsStore, "getValue").mockReturnValue(false);
        jest.spyOn(SettingsStore, "setValue").mockResolvedValue(undefined);
        stubClient();
    });

    afterAll(() => {
        jest.spyOn(SettingsStore, "getValue").mockRestore();
        jest.spyOn(SettingsStore, "setValue").mockRestore();
    });

    function renderTile(room: Room) {
        // Find this room's create event (it should have one!)
        const createEvent = room.currentState.getStateEvents("m.room.create")[0];
        expect(createEvent).toBeTruthy();

        return render(
            <RoomContext.Provider value={getRoomContext(room, {})}>
                <RoomPredecessorTile mxEvent={createEvent} />
            </RoomContext.Provider>,
        );
    }

    it("Renders as expected", () => {
        const roomCreate = renderTile(makeRoom({ createEventHasPredecessor: true }));
        expect(roomCreate.asFragment()).toMatchSnapshot();
    });

    it("Links to the old version of the room", () => {
        renderTile(makeRoom({ createEventHasPredecessor: true }));
        expect(screen.getByText("Click here to see older messages.")).toHaveAttribute(
            "href",
            "https://matrix.to/#/old_room_id/$tombstone_event_id",
        );
    });

    describe("(filtering warnings about no predecessor)", () => {
        filterConsole("RoomPredecessorTile unexpectedly used in a room with no predecessor.");

        it("Shows an empty div if there is no predecessor", () => {
            renderTile(makeRoom({}));
            expect(screen.queryByText("Click here to see older messages.", { exact: false })).toBeNull();
        });
    });

    it("Opens the old room on click", async () => {
        renderTile(makeRoom({ createEventHasPredecessor: true }));
        const link = screen.getByText("Click here to see older messages.");

        await act(() => userEvent.click(link));

        await waitFor(() =>
            expect(dis.dispatch).toHaveBeenCalledWith({
                action: Action.ViewRoom,
                event_id: "$tombstone_event_id",
                highlighted: true,
                room_id: "old_room_id",
                metricsTrigger: "Predecessor",
                metricsViaKeyboard: false,
            }),
        );
    });

    it("Ignores m.predecessor if labs flag is off", () => {
        renderTile(makeRoom({ createEventHasPredecessor: true, predecessorEventExists: true }));
        expect(screen.getByText("Click here to see older messages.")).toHaveAttribute(
            "href",
            "https://matrix.to/#/old_room_id/$tombstone_event_id",
        );
    });

    describe("If the predecessor room is not found", () => {
        filterConsole("Failed to find predecessor room with id old_room_id");

        beforeEach(() => {
            mocked(MatrixClientPeg.get().getRoom).mockReturnValue(null);
        });

        it("Shows an error if there are no via servers", () => {
            renderTile(makeRoom({ createEventHasPredecessor: true, predecessorEventExists: true }));
            expect(screen.getByText("Can't find the old version of this room", { exact: false })).toBeInTheDocument();
        });
    });

    describe("When feature_dynamic_room_predecessors = true", () => {
        beforeEach(() => {
            jest.spyOn(SettingsStore, "getValue").mockImplementation(
                (settingName) => settingName === "feature_dynamic_room_predecessors",
            );
        });

        afterEach(() => {
            jest.spyOn(SettingsStore, "getValue").mockReset();
        });

        it("Uses the create event if there is no m.predecessor", () => {
            renderTile(makeRoom({ createEventHasPredecessor: true }));
            expect(screen.getByText("Click here to see older messages.")).toHaveAttribute(
                "href",
                "https://matrix.to/#/old_room_id/$tombstone_event_id",
            );
        });

        it("Uses m.predecessor when it's there", () => {
            renderTile(makeRoom({ createEventHasPredecessor: true, predecessorEventExists: true }));
            expect(screen.getByText("Click here to see older messages.")).toHaveAttribute(
                "href",
                "https://matrix.to/#/old_room_id_from_predecessor",
            );
        });

        it("Links to the event in the room if event ID is provided", () => {
            renderTile(
                makeRoom({
                    createEventHasPredecessor: true,
                    predecessorEventExists: true,
                    predecessorEventHasEventId: true,
                }),
            );
            expect(screen.getByText("Click here to see older messages.")).toHaveAttribute(
                "href",
                "https://matrix.to/#/old_room_id_from_predecessor/$tombstone_event_id_from_predecessor",
            );
        });

        describe("If the predecessor room is not found", () => {
            filterConsole("Failed to find predecessor room with id old_room_id");

            beforeEach(() => {
                mocked(MatrixClientPeg.get().getRoom).mockReturnValue(null);
            });

            it("Shows an error if there are no via servers", () => {
                renderTile(makeRoom({ createEventHasPredecessor: true, predecessorEventExists: true }));
                expect(
                    screen.getByText("Can't find the old version of this room", { exact: false }),
                ).toBeInTheDocument();
            });

            it("Shows a tile if there are via servers", () => {
                renderTile(
                    makeRoom({
                        createEventHasPredecessor: true,
                        predecessorEventExists: true,
                        predecessorEventHasViaServers: true,
                    }),
                );
                expect(screen.getByText("Click here to see older messages.")).toHaveAttribute(
                    "href",
                    "https://matrix.to/#/old_room_id_from_predecessor?via=a.example.com&via=b.example.com",
                );
            });

            it("Shows a tile linking to an event if there are via servers", () => {
                renderTile(
                    makeRoom({
                        createEventHasPredecessor: true,
                        predecessorEventExists: true,
                        predecessorEventHasEventId: true,
                        predecessorEventHasViaServers: true,
                    }),
                );
                expect(screen.getByText("Click here to see older messages.")).toHaveAttribute(
                    "href",
                    "https://matrix.to/#/old_room_id_from_predecessor/$tombstone_event_id_from_predecessor?via=a.example.com&via=b.example.com",
                );
            });
        });
    });
});
