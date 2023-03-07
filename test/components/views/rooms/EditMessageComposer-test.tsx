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

import { IContent } from "matrix-js-sdk/src/matrix";

import { createEditContent } from "../../../../src/components/views/rooms/EditMessageComposer";
import EditorModel from "../../../../src/editor/model";
import { createPartCreator } from "../../../editor/mock";
import { mkEvent } from "../../../test-utils";
import DocumentOffset from "../../../../src/editor/offset";
import { attachDifferentialMentions } from "../../../../src/components/views/rooms/EditMessageComposer";

describe("<EditMessageComposer/>", () => {
    const editedEvent = mkEvent({
        type: "m.room.message",
        user: "@alice:test",
        room: "!abc:test",
        content: { body: "original message", msgtype: "m.text" },
        event: true,
    });

    describe("createEditContent", () => {
        it("sends plaintext messages correctly", () => {
            const model = new EditorModel([], createPartCreator());
            const documentOffset = new DocumentOffset(11, true);
            model.update("hello world", "insertText", documentOffset);

            const content = createEditContent(model, editedEvent);

            expect(content).toEqual({
                "body": " * hello world",
                "msgtype": "m.text",
                "m.new_content": {
                    "body": "hello world",
                    "msgtype": "m.text",
                    "org.matrix.msc3952.mentions": {},
                },
                "m.relates_to": {
                    event_id: editedEvent.getId(),
                    rel_type: "m.replace",
                },
                "org.matrix.msc3952.mentions": {},
            });
        });

        it("sends markdown messages correctly", () => {
            const model = new EditorModel([], createPartCreator());
            const documentOffset = new DocumentOffset(13, true);
            model.update("hello *world*", "insertText", documentOffset);

            const content = createEditContent(model, editedEvent);

            expect(content).toEqual({
                "body": " * hello *world*",
                "msgtype": "m.text",
                "format": "org.matrix.custom.html",
                "formatted_body": " * hello <em>world</em>",
                "m.new_content": {
                    "body": "hello *world*",
                    "msgtype": "m.text",
                    "format": "org.matrix.custom.html",
                    "formatted_body": "hello <em>world</em>",
                    "org.matrix.msc3952.mentions": {},
                },
                "m.relates_to": {
                    event_id: editedEvent.getId(),
                    rel_type: "m.replace",
                },
                "org.matrix.msc3952.mentions": {},
            });
        });

        it("strips /me from messages and marks them as m.emote accordingly", () => {
            const model = new EditorModel([], createPartCreator());
            const documentOffset = new DocumentOffset(22, true);
            model.update("/me blinks __quickly__", "insertText", documentOffset);

            const content = createEditContent(model, editedEvent);

            expect(content).toEqual({
                "body": " * blinks __quickly__",
                "msgtype": "m.emote",
                "format": "org.matrix.custom.html",
                "formatted_body": " * blinks <strong>quickly</strong>",
                "m.new_content": {
                    "body": "blinks __quickly__",
                    "msgtype": "m.emote",
                    "format": "org.matrix.custom.html",
                    "formatted_body": "blinks <strong>quickly</strong>",
                    "org.matrix.msc3952.mentions": {},
                },
                "m.relates_to": {
                    event_id: editedEvent.getId(),
                    rel_type: "m.replace",
                },
                "org.matrix.msc3952.mentions": {},
            });
        });

        it("allows emoting with non-text parts", () => {
            const model = new EditorModel([], createPartCreator());
            const documentOffset = new DocumentOffset(16, true);
            model.update("/me ✨sparkles✨", "insertText", documentOffset);
            expect(model.parts.length).toEqual(4); // Emoji count as non-text

            const content = createEditContent(model, editedEvent);

            expect(content).toEqual({
                "body": " * ✨sparkles✨",
                "msgtype": "m.emote",
                "m.new_content": {
                    "body": "✨sparkles✨",
                    "msgtype": "m.emote",
                    "org.matrix.msc3952.mentions": {},
                },
                "m.relates_to": {
                    event_id: editedEvent.getId(),
                    rel_type: "m.replace",
                },
                "org.matrix.msc3952.mentions": {},
            });
        });

        it("allows sending double-slash escaped slash commands correctly", () => {
            const model = new EditorModel([], createPartCreator());
            const documentOffset = new DocumentOffset(32, true);

            model.update("//dev/null is my favourite place", "insertText", documentOffset);

            const content = createEditContent(model, editedEvent);

            // TODO Edits do not properly strip the double slash used to skip
            // command processing.
            expect(content).toEqual({
                "body": " * //dev/null is my favourite place",
                "msgtype": "m.text",
                "m.new_content": {
                    "body": "//dev/null is my favourite place",
                    "msgtype": "m.text",
                    "org.matrix.msc3952.mentions": {},
                },
                "m.relates_to": {
                    event_id: editedEvent.getId(),
                    rel_type: "m.replace",
                },
                "org.matrix.msc3952.mentions": {},
            });
        });
    });

    describe("attachDifferentialMentions", () => {
        const partsCreator = createPartCreator();

        it("no mentions", () => {
            const model = new EditorModel([], partsCreator);
            const prevContent: IContent = {};
            const mentions = attachDifferentialMentions("@alice:test", prevContent, model);
            expect(mentions).toEqual({});
        });

        it("mentions do not propagate", () => {
            const model = new EditorModel([], partsCreator);
            const prevContent: IContent = { "org.matrix.msc3952.mentions": { user_ids: ["@bob:test"], room: true } };
            const mentions = attachDifferentialMentions("@alice:test", prevContent, model);
            expect(mentions).toEqual({});
        });

        it("test user mentions", () => {
            const model = new EditorModel([partsCreator.userPill("Bob", "@bob:test")], partsCreator);
            const prevContent: IContent = {};
            const mentions = attachDifferentialMentions("@alice:test", prevContent, model);
            expect(mentions).toEqual({ user_ids: ["@bob:test"] });
        });

        it("test prev user mentions", () => {
            const model = new EditorModel([partsCreator.userPill("Bob", "@bob:test")], partsCreator);
            const prevContent: IContent = { "org.matrix.msc3952.mentions": { user_ids: ["@bob:test"] } };
            const mentions = attachDifferentialMentions("@alice:test", prevContent, model);
            expect(mentions).toEqual({});
        });

        it("test room mention", () => {
            const model = new EditorModel([partsCreator.atRoomPill("@room")], partsCreator);
            const prevContent: IContent = {};
            const mentions = attachDifferentialMentions("@alice:test", prevContent, model);
            expect(mentions).toEqual({ room: true });
        });

        it("test prev room mention", () => {
            const model = new EditorModel([partsCreator.atRoomPill("@room")], partsCreator);
            const prevContent: IContent = { "org.matrix.msc3952.mentions": { room: true } };
            const mentions = attachDifferentialMentions("@alice:test", prevContent, model);
            expect(mentions).toEqual({});
        });

        it("test broken mentions", () => {
            // Replying to a room mention shouldn't automatically be a room mention.
            const model = new EditorModel([], partsCreator);
            // @ts-ignore - Purposefully testing invalid data.
            const prevContent: IContent = { "org.matrix.msc3952.mentions": { user_ids: "@bob:test" } };
            const mentions = attachDifferentialMentions("@alice:test", prevContent, model);
            expect(mentions).toEqual({});
        });
    });
});
