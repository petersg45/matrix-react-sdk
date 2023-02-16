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
import { fireEvent, render } from "@testing-library/react";
import { Room } from "matrix-js-sdk/src/matrix";

import { PollHistoryDialog } from "../../../../../src/components/views/dialogs/polls/PollHistoryDialog";
import {
    getMockClientWithEventEmitter,
    makePollEndEvent,
    makePollStartEvent,
    mockClientMethodsUser,
    mockIntlDateTimeFormat,
    setupRoomWithPollEvents,
    unmockIntlDateTimeFormat,
} from "../../../../test-utils";
import { RoomPermalinkCreator } from "../../../../../src/utils/permalinks/Permalinks";
import defaultDispatcher from "../../../../../src/dispatcher/dispatcher";
import { Action } from "../../../../../src/dispatcher/actions";

describe("<PollHistoryDialog />", () => {
    const userId = "@alice:domain.org";
    const roomId = "!room:domain.org";
    const mockClient = getMockClientWithEventEmitter({
        ...mockClientMethodsUser(userId),
        getRoom: jest.fn(),
        relations: jest.fn(),
        decryptEventIfNeeded: jest.fn(),
    });
    const room = new Room(roomId, mockClient, userId);

    const defaultProps = {
        roomId,
        matrixClient: mockClient,
        permalinkCreator: new RoomPermalinkCreator(room),
        onFinished: jest.fn(),
    };
    const getComponent = () => render(<PollHistoryDialog {...defaultProps} />);

    beforeAll(() => {
        mockIntlDateTimeFormat();
    });

    beforeEach(() => {
        mockClient.getRoom.mockReturnValue(room);
        mockClient.relations.mockResolvedValue({ events: [] });
        const timeline = room.getLiveTimeline();
        jest.spyOn(timeline, "getEvents").mockReturnValue([]);
        jest.spyOn(defaultDispatcher, "dispatch").mockClear();
        defaultProps.onFinished.mockClear();
    });

    afterAll(() => {
        unmockIntlDateTimeFormat();
    });

    it("throws when room is not found", () => {
        mockClient.getRoom.mockReturnValue(null);

        expect(() => getComponent()).toThrow("Cannot find room");
    });

    it("renders a no polls message when there are no active polls in the timeline", () => {
        const { getByText } = getComponent();

        expect(getByText("There are no active polls in this room")).toBeTruthy();
    });

    it("renders a no past polls message when there are no past polls in the timeline", () => {
        const { getByText } = getComponent();

        fireEvent.click(getByText("Past polls"));

        expect(getByText("There are no past polls in this room")).toBeTruthy();
    });

    it("renders a list of active polls when there are polls in the timeline", async () => {
        const timestamp = 1675300825090;
        const pollStart1 = makePollStartEvent("Question?", userId, undefined, { ts: timestamp, id: "$1" });
        const pollStart2 = makePollStartEvent("Where?", userId, undefined, { ts: timestamp + 10000, id: "$2" });
        const pollStart3 = makePollStartEvent("What?", userId, undefined, { ts: timestamp + 70000, id: "$3" });
        const pollEnd3 = makePollEndEvent(pollStart3.getId()!, roomId, userId, timestamp + 1);
        await setupRoomWithPollEvents([pollStart2, pollStart3, pollStart1], [], [pollEnd3], mockClient, room);

        const { container, queryByText, getByTestId } = getComponent();

        expect(getByTestId("filter-tab-PollHistoryDialog_filter-ACTIVE").firstElementChild).toBeChecked();

        expect(container).toMatchSnapshot();
        // this poll is ended, and default filter is ACTIVE
        expect(queryByText("What?")).not.toBeInTheDocument();
    });

    it("filters ended polls", async () => {
        const pollStart1 = makePollStartEvent("Question?", userId, undefined, { ts: 1675300825090, id: "$1" });
        const pollStart2 = makePollStartEvent("Where?", userId, undefined, { ts: 1675300725090, id: "$2" });
        const pollStart3 = makePollStartEvent("What?", userId, undefined, { ts: 1675200725090, id: "$3" });
        const pollEnd3 = makePollEndEvent(pollStart3.getId()!, roomId, userId, 1675200725090 + 1);
        await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

        const { getByText, queryByText, getByTestId } = getComponent();

        expect(getByText("Question?")).toBeInTheDocument();
        expect(getByText("Where?")).toBeInTheDocument();
        // this poll is ended, and default filter is ACTIVE
        expect(queryByText("What?")).not.toBeInTheDocument();

        fireEvent.click(getByText("Past polls"));
        expect(getByTestId("filter-tab-PollHistoryDialog_filter-ENDED").firstElementChild).toBeChecked();

        // active polls no longer shown
        expect(queryByText("Question?")).not.toBeInTheDocument();
        expect(queryByText("Where?")).not.toBeInTheDocument();
        // this poll is ended
        expect(getByText("What?")).toBeInTheDocument();
    });

    fdescribe("Poll detail", () => {
        const timestamp = 1675300825090;
        const pollStart1 = makePollStartEvent("Question?", userId, undefined, { ts: timestamp, id: "$1" });
        const pollStart2 = makePollStartEvent("Where?", userId, undefined, { ts: timestamp + 10000, id: "$2" });
        const pollStart3 = makePollStartEvent("What?", userId, undefined, { ts: timestamp + 70000, id: "$3" });
        const pollEnd3 = makePollEndEvent(pollStart3.getId()!, roomId, userId, timestamp + 1, "$4");

        it("displays poll detail on active poll list item click", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText, queryByText } = getComponent();

            fireEvent.click(getByText("Question?"));

            expect(queryByText("Polls history")).not.toBeInTheDocument();
            // elements from MPollBody
            expect(getByText("Question?")).toMatchSnapshot();
            expect(getByText("Socks")).toBeInTheDocument();
            expect(getByText("Shoes")).toBeInTheDocument();
        });

        it("links to the poll start event from an active poll detail", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText } = getComponent();

            fireEvent.click(getByText("Question?"));

            // links to poll start event
            expect(getByText("View poll in timeline").getAttribute("href")).toBe(
                `https://matrix.to/#/!room:domain.org/${pollStart1.getId()!}`,
            );
        });

        it("navigates in app when clicking view in timeline button", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText } = getComponent();

            fireEvent.click(getByText("Question?"));

            const event = new MouseEvent("click", { bubbles: true, cancelable: true });
            jest.spyOn(event, "preventDefault");
            fireEvent(getByText("View poll in timeline"), event);

            expect(event.preventDefault).toHaveBeenCalled();

            expect(defaultDispatcher.dispatch).toHaveBeenCalledWith({
                action: Action.ViewRoom,
                event_id: pollStart1.getId()!,
                highlighted: true,
                metricsTrigger: undefined,
                room_id: pollStart1.getRoomId()!,
            });

            // dialog closed
            expect(defaultProps.onFinished).toHaveBeenCalled();
        });

        it("doesnt navigate in app when view in timeline link is ctrl + clicked", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText } = getComponent();

            fireEvent.click(getByText("Question?"));

            const event = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
            jest.spyOn(event, "preventDefault");
            fireEvent(getByText("View poll in timeline"), event);

            expect(event.preventDefault).not.toHaveBeenCalled();
            expect(defaultDispatcher.dispatch).not.toHaveBeenCalled();
            expect(defaultProps.onFinished).not.toHaveBeenCalled();
        });

        it("navigates back to poll list from detail view on header click", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText, queryByText, getByTestId, container } = getComponent();

            fireEvent.click(getByText("Question?"));

            // detail view
            expect(getByText("Question?")).toBeInTheDocument();

            // header not shown
            expect(queryByText("Polls history")).not.toBeInTheDocument();

            expect(getByText("Active polls")).toMatchSnapshot();
            fireEvent.click(getByText("Active polls"));

            // main list header displayed again
            expect(getByText("Polls history")).toBeInTheDocument();
            // active filter still active
            expect(getByTestId("filter-tab-PollHistoryDialog_filter-ACTIVE").firstElementChild).toBeChecked();
            // list displayed
            expect(container.getElementsByClassName("mx_PollHistoryList_list").length).toBeTruthy();
        });

        it("displays poll detail on past poll list item click", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText } = getComponent();

            fireEvent.click(getByText("Past polls"));

            // pollStart3 is ended
            fireEvent.click(getByText("What?"));

            expect(getByText("What?")).toMatchSnapshot();
        });

        it("links to the poll end events from a ended poll detail", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText } = getComponent();

            fireEvent.click(getByText("Past polls"));

            // pollStart3 is ended
            fireEvent.click(getByText("What?"));

            // links to poll end event
            expect(getByText("View poll in timeline").getAttribute("href")).toBe(
                `https://matrix.to/#/!room:domain.org/${pollEnd3.getId()!}`,
            );
        });

        it("navigates back to poll list from detail view on header click", async () => {
            await setupRoomWithPollEvents([pollStart1, pollStart2, pollStart3], [], [pollEnd3], mockClient, room);

            const { getByText, queryByText, getByTestId, container } = getComponent();

            fireEvent.click(getByText("Question?"));

            // detail view
            expect(getByText("Question?")).toBeInTheDocument();

            // header not shown
            expect(queryByText("Polls history")).not.toBeInTheDocument();

            expect(getByText("Active polls")).toMatchSnapshot();
            fireEvent.click(getByText("Active polls"));

            // main list header displayed again
            expect(getByText("Polls history")).toBeInTheDocument();
            // active filter still active
            expect(getByTestId("filter-tab-PollHistoryDialog_filter-ACTIVE").firstElementChild).toBeChecked();
            // list displayed
            expect(container.getElementsByClassName("mx_PollHistoryList_list").length).toBeTruthy();
        });
    });
});
