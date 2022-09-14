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

import * as React from "react";
// eslint-disable-next-line deprecate/import
import { mount, ReactWrapper } from "enzyme";
import { MatrixEvent, MsgType, RoomMember } from "matrix-js-sdk/src/matrix";
import { THREAD_RELATION_TYPE } from "matrix-js-sdk/src/models/thread";

import { createTestClient, mkEvent, mkStubRoom, stubClient } from "../../../test-utils";
import MessageComposer from "../../../../src/components/views/rooms/MessageComposer";
import MatrixClientContext from "../../../../src/contexts/MatrixClientContext";
import { MatrixClientPeg } from "../../../../src/MatrixClientPeg";
import RoomContext from "../../../../src/contexts/RoomContext";
import { IRoomState } from "../../../../src/components/structures/RoomView";
import ResizeNotifier from "../../../../src/utils/ResizeNotifier";
import { RoomPermalinkCreator } from "../../../../src/utils/permalinks/Permalinks";
import { LocalRoom } from "../../../../src/models/LocalRoom";
import MessageComposerButtons from "../../../../src/components/views/rooms/MessageComposerButtons";
import { FEATURES } from "../../../../src/settings/Settings";
import SettingsStore from "../../../../src/settings/SettingsStore";
import { SettingLevel } from "../../../../src/settings/SettingLevel";
import dis from "../../../../src/dispatcher/dispatcher";
import { Action } from "../../../../src/dispatcher/actions";
import { SendMessageComposer } from "../../../../src/components/views/rooms/SendMessageComposer";
import { E2EStatus } from "../../../../src/utils/ShieldUtils";

describe("MessageComposer", () => {
    stubClient();
    const cli = createTestClient();

    describe("for a Room", () => {
        const room = mkStubRoom("!roomId:server", "Room 1", cli);

        it("Renders a SendMessageComposer and MessageComposerButtons by default", () => {
            const wrapper = wrapAndRender({ room });

            expect(wrapper.find("SendMessageComposer")).toHaveLength(1);
            expect(wrapper.find("MessageComposerButtons")).toHaveLength(1);
        });

        it("Does not render a SendMessageComposer or MessageComposerButtons when user has no permission", () => {
            const wrapper = wrapAndRender({ room }, false);

            expect(wrapper.find("SendMessageComposer")).toHaveLength(0);
            expect(wrapper.find("MessageComposerButtons")).toHaveLength(0);
            expect(wrapper.find(".mx_MessageComposer_noperm_error")).toHaveLength(1);
        });

        it("Does not render a SendMessageComposer or MessageComposerButtons when room is tombstoned", () => {
            const wrapper = wrapAndRender({ room }, true, mkEvent({
                event: true,
                type: "m.room.tombstone",
                room: room.roomId,
                user: "@user1:server",
                skey: "",
                content: {},
                ts: Date.now(),
            }));

            expect(wrapper.find("SendMessageComposer")).toHaveLength(0);
            expect(wrapper.find("MessageComposerButtons")).toHaveLength(0);
            expect(wrapper.find(".mx_MessageComposer_roomReplaced_header")).toHaveLength(1);
        });

        describe("when receiving a »reply_to_event«", () => {
            let wrapper: ReactWrapper;
            let resizeNotifier: ResizeNotifier;

            beforeEach(() => {
                resizeNotifier = {
                    notifyTimelineHeightChanged: jest.fn(),
                } as unknown as ResizeNotifier;
                wrapper = wrapAndRender({
                    room,
                    resizeNotifier,
                });
            });

            it("should call notifyTimelineHeightChanged() for the same context", (done) => {
                dis.dispatch({
                    action: "reply_to_event",
                    context: (wrapper.instance as unknown as MessageComposer).context,
                });
                wrapper.update();

                setTimeout(() => {
                    expect(resizeNotifier.notifyTimelineHeightChanged).toHaveBeenCalled();
                    done();
                }, 150); // higher timeout than in MessageComposer::onAction
            });

            it("should not call notifyTimelineHeightChanged() for a different context", (done) => {
                dis.dispatch({
                    action: "reply_to_event",
                    context: "test",
                });
                wrapper.update();

                setTimeout(() => {
                    expect(resizeNotifier.notifyTimelineHeightChanged).not.toHaveBeenCalled();
                    done();
                }, 150); // higher timeout than in MessageComposer::onAction
            });
        });

        // test button display depending on settings
        [
            {
                setting: "MessageComposerInput.showStickersButton",
                prop: "showStickersButton",
            },
            {
                setting: "MessageComposerInput.showPollsButton",
                prop: "showPollsButton",
            },
            {
                setting: FEATURES.VOICE_BROADCAST,
                prop: "showVoiceBroadcastButton",
            },
        ].forEach(({ setting, prop }) => {
            [true, false].forEach((value: boolean) => {
                describe(`when ${setting} = ${value}`, () => {
                    let wrapper: ReactWrapper;

                    beforeEach(() => {
                        SettingsStore.setValue(setting, null, SettingLevel.DEVICE, value);
                        wrapper = wrapAndRender({ room });
                    });

                    it(`should pass the prop ${prop} = ${value}`, () => {
                        expect(wrapper.find(MessageComposerButtons).props()[prop]).toBe(value);
                    });

                    describe(`and setting ${setting} to ${!value}`, () => {
                        beforeEach(async () => {
                            // simulate settings update
                            await SettingsStore.setValue(setting, null, SettingLevel.DEVICE, !value);
                            dis.dispatch({
                                action: Action.SettingUpdated,
                                settingName: setting,
                                newValue: !value,
                            }, true);
                            wrapper.update();
                        });

                        it(`should pass the prop ${prop} = ${!value}`, () => {
                            expect(wrapper.find(MessageComposerButtons).props()[prop]).toBe(!value);
                        });
                    });
                });
            });
        });

        describe("when not replying to an event", () => {
            it("should pass the expected placeholder to SendMessageComposer", () => {
                const wrapper = wrapAndRender({ room });
                expect(wrapper.find(SendMessageComposer).props().placeholder).toBe("Send a message…");
            });

            it("and an e2e status it should pass the expected placeholder to SendMessageComposer", () => {
                const wrapper = wrapAndRender({
                    room,
                    e2eStatus: E2EStatus.Normal,
                });
                expect(wrapper.find(SendMessageComposer).props().placeholder).toBe("Send an encrypted message…");
            });
        });

        describe("when replying to an event", () => {
            let replyToEvent: MatrixEvent;
            let props: Partial<React.ComponentProps<typeof MessageComposer>>;

            const checkPlaceholder = (expected: string) => {
                it("should pass the expected placeholder to SendMessageComposer", () => {
                    const wrapper = wrapAndRender(props);
                    expect(wrapper.find(SendMessageComposer).props().placeholder).toBe(expected);
                });
            };

            const setEncrypted = () => {
                beforeEach(() => {
                    props.e2eStatus = E2EStatus.Normal;
                });
            };

            beforeEach(() => {
                replyToEvent = mkEvent({
                    event: true,
                    type: MsgType.Text,
                    user: cli.getUserId(),
                    content: {},
                });

                props = {
                    room,
                    replyToEvent,
                };
            });

            describe("without encryption", () => {
                checkPlaceholder("Send a reply…");
            });

            describe("with encryption", () => {
                setEncrypted();
                checkPlaceholder("Send an encrypted reply…");
            });

            describe("with a non-thread relation", () => {
                beforeEach(() => {
                    props.relation = { rel_type: "test" };
                });

                checkPlaceholder("Send a reply…");
            });

            describe("that is a thread", () => {
                beforeEach(() => {
                    props.relation = { rel_type: THREAD_RELATION_TYPE.name };
                });

                checkPlaceholder("Reply to thread…");

                describe("with encryption", () => {
                    setEncrypted();
                    checkPlaceholder("Reply to encrypted thread…");
                });
            });
        });
    });

    describe("for a LocalRoom", () => {
        const localRoom = new LocalRoom("!room:example.com", cli, cli.getUserId()!);

        it("should pass the sticker picker disabled prop", () => {
            const wrapper = wrapAndRender({ room: localRoom });
            expect(wrapper.find(MessageComposerButtons).props().showStickersButton).toBe(false);
        });
    });
});

function wrapAndRender(
    props: Partial<React.ComponentProps<typeof MessageComposer>> = {},
    canSendMessages = true,
    tombstone?: MatrixEvent,
): ReactWrapper {
    const mockClient = MatrixClientPeg.get();
    const roomId = "myroomid";
    const room: any = props.room || {
        currentState: undefined,
        roomId,
        client: mockClient,
        getMember: function(userId: string): RoomMember {
            return new RoomMember(roomId, userId);
        },
    };

    const roomState = {
        room, canSendMessages, tombstone,
    } as unknown as IRoomState;

    const defaultProps = {
        room,
        resizeNotifier: new ResizeNotifier(),
        permalinkCreator: new RoomPermalinkCreator(room),
    };

    return mount(
        <MatrixClientContext.Provider value={mockClient}>
            <RoomContext.Provider value={roomState}>
                <MessageComposer {...defaultProps} {...props} />
            </RoomContext.Provider>
        </MatrixClientContext.Provider>,
    );
}
