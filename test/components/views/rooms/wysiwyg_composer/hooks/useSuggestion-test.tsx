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

import {
    Suggestion,
    findMentionOrCommand,
    processCommand,
    processMention,
    processSelectionChange,
} from "../../../../../../src/components/views/rooms/wysiwyg_composer/hooks/useSuggestion";

function createMockPlainTextSuggestionPattern(props: Partial<Suggestion> = {}): Suggestion {
    return {
        keyChar: "/",
        type: "command",
        text: "some text",
        node: document.createTextNode(""),
        startOffset: 0,
        endOffset: 0,
        ...props,
    };
}

describe("processCommand", () => {
    it("does not change parent hook state if suggestion is null", () => {
        // create a mockSuggestion using the text node above
        const mockSetSuggestion = jest.fn();
        const mockSetText = jest.fn();

        // call the function with a null suggestion
        processCommand("should not be seen", null, mockSetSuggestion, mockSetText);

        // check that the parent state setter has not been called
        expect(mockSetText).not.toHaveBeenCalled();
    });

    it("can change the parent hook state when required", () => {
        // create a div and append a text node to it with some initial text
        const editorDiv = document.createElement("div");
        const initialText = "text";
        const textNode = document.createTextNode(initialText);
        editorDiv.appendChild(textNode);

        // create a mockSuggestion using the text node above
        const mockSuggestion = createMockPlainTextSuggestionPattern({ node: textNode });
        const mockSetSuggestion = jest.fn();
        const mockSetText = jest.fn();
        const replacementText = "/replacement text";

        processCommand(replacementText, mockSuggestion, mockSetSuggestion, mockSetText);

        // check that the text has changed and includes a trailing space
        expect(mockSetText).toHaveBeenCalledWith(`${replacementText} `);
    });
});

describe.only("processMention", () => {
    // TODO refactor and expand tests when mentions become <a> tags
    it("returns early when suggestion is null", () => {
        const mockSetSuggestion = jest.fn();
        const mockSetText = jest.fn();
        processMention("href", "displayName", {}, null, mockSetSuggestion, mockSetText);

        expect(mockSetSuggestion).not.toHaveBeenCalled();
        expect(mockSetText).not.toHaveBeenCalled();
    });

    it("can insert a mention into an empty text node", () => {
        // make an empty text node, set the cursor inside it and then append to the document
        const textNode = document.createTextNode("");
        document.body.appendChild(textNode);
        document.getSelection()?.setBaseAndExtent(textNode, 0, textNode, 0);

        // call the util function
        const href = "www.test.com";
        const displayName = "displayName";
        const mockSetSuggestion = jest.fn();
        const mockSetText = jest.fn();
        processMention(
            href,
            displayName,
            {},
            { node: textNode, startOffset: 0, endOffset: 0 } as unknown as Suggestion,
            mockSetSuggestion,
            mockSetText,
        );

        // placeholder testing for the changed content - these tests will all be changed
        // when the mention is inserted as an <a> tagfs
        const { textContent } = textNode;
        expect(textContent.includes(href)).toBe(true);
        expect(textContent.includes(displayName)).toBe(true);

        expect(mockSetText).toHaveBeenCalledWith(expect.stringContaining(displayName));
        expect(mockSetSuggestion).toHaveBeenCalledWith(null);
    });
});

describe("processSelectionChange", () => {
    function createMockEditorRef(element: HTMLDivElement | null = null): React.RefObject<HTMLDivElement> {
        return { current: element } as React.RefObject<HTMLDivElement>;
    }

    function appendEditorWithTextNodeContaining(initialText = ""): [HTMLDivElement, Node] {
        // create the elements/nodes
        const mockEditor = document.createElement("div");
        const textNode = document.createTextNode(initialText);

        // append text node to the editor, editor to the document body
        mockEditor.appendChild(textNode);
        document.body.appendChild(mockEditor);

        return [mockEditor, textNode];
    }

    const mockSetSuggestion = jest.fn();
    beforeEach(() => {
        mockSetSuggestion.mockClear();
    });

    it("returns early if current editorRef is null", () => {
        const mockEditorRef = createMockEditorRef(null);
        // we monitor for the call to document.createNodeIterator to indicate an early return
        const nodeIteratorSpy = jest.spyOn(document, "createNodeIterator");

        processSelectionChange(mockEditorRef, jest.fn());
        expect(nodeIteratorSpy).not.toHaveBeenCalled();

        // tidy up to avoid potential impacts on other tests
        nodeIteratorSpy.mockRestore();
    });

    it("calls setSuggestion with null if selection is not a cursor", () => {
        const [mockEditor, textNode] = appendEditorWithTextNodeContaining("content");
        const mockEditorRef = createMockEditorRef(mockEditor);

        // create a selection in the text node that has different start and end locations ie it
        // is not a cursor
        document.getSelection()?.setBaseAndExtent(textNode, 0, textNode, 4);

        // process the selection and check that we do not attempt to set the suggestion
        processSelectionChange(mockEditorRef, mockSetSuggestion);
        expect(mockSetSuggestion).toHaveBeenCalledWith(null);
    });

    it("calls setSuggestion with null if selection cursor is not inside a text node", () => {
        const [mockEditor] = appendEditorWithTextNodeContaining("content");
        const mockEditorRef = createMockEditorRef(mockEditor);

        // create a selection that points at the editor element, not the text node it contains
        document.getSelection()?.setBaseAndExtent(mockEditor, 0, mockEditor, 0);

        // process the selection and check that we do not attempt to set the suggestion
        processSelectionChange(mockEditorRef, mockSetSuggestion);
        expect(mockSetSuggestion).toHaveBeenCalledWith(null);
    });

    it("calls setSuggestion with null if we have an existing suggestion but no command match", () => {
        const [mockEditor, textNode] = appendEditorWithTextNodeContaining("content");
        const mockEditorRef = createMockEditorRef(mockEditor);

        // create a selection in the text node that has identical start and end locations, ie it is a cursor
        document.getSelection()?.setBaseAndExtent(textNode, 0, textNode, 0);

        // the call to process the selection will have an existing suggestion in state due to the second
        // argument being non-null, expect that we clear this suggestion now that the text is not a command
        processSelectionChange(mockEditorRef, mockSetSuggestion);
        expect(mockSetSuggestion).toHaveBeenCalledWith(null);
    });

    it("calls setSuggestion with the expected arguments when text node is valid command", () => {
        const commandText = "/potentialCommand";
        const [mockEditor, textNode] = appendEditorWithTextNodeContaining(commandText);
        const mockEditorRef = createMockEditorRef(mockEditor);

        // create a selection in the text node that has identical start and end locations, ie it is a cursor
        document.getSelection()?.setBaseAndExtent(textNode, 3, textNode, 3);

        // process the change and check the suggestion that is set looks as we expect it to
        processSelectionChange(mockEditorRef, mockSetSuggestion);
        expect(mockSetSuggestion).toHaveBeenCalledWith({
            keyChar: "/",
            type: "command",
            text: "potentialCommand",
            node: textNode,
            startOffset: 0,
            endOffset: commandText.length,
        });
    });
});

describe("findMentionOrCommand", () => {
    const command = "/someCommand";
    const userMention = "@userMention";
    const roomMention = "#roomMention";

    const mentionTestCases = [userMention, roomMention];
    const allTestCases = [command, userMention, roomMention];

    it("returns null if content does not contain any mention or command characters", () => {
        expect(findMentionOrCommand("hello", 1)).toBeNull();
    });

    it("returns null if the offset is outside the content length", () => {
        expect(findMentionOrCommand("hi", 30)).toBeNull();
        expect(findMentionOrCommand("hi", -10)).toBeNull();
    });

    it.each(allTestCases)("returns an object when the whole input is special case: %s", (text) => {
        // test for cursor at after special character, before end, end
        expect(findMentionOrCommand(text, 1)).toEqual({ text, startOffset: 0 });
        expect(findMentionOrCommand(text, text.length - 2)).toEqual({ text, startOffset: 0 });
        expect(findMentionOrCommand(text, text.length)).toEqual({ text, startOffset: 0 });
    });

    it("returns null when a command is followed by other text", () => {
        const followingText = " followed by something";

        // check for cursor inside and outside the command
        expect(findMentionOrCommand(command + followingText, command.length - 2)).toBeNull();
        expect(findMentionOrCommand(command + followingText, command.length + 2)).toBeNull();
    });

    it.each(mentionTestCases)("returns an object when a %s is followed by other text", (mention) => {
        const followingText = " followed by something else";
        expect(findMentionOrCommand(mention + followingText, mention.length - 2)).toEqual({
            text: mention,
            startOffset: 0,
        });
    });

    it("returns null if there is a command surrounded by text", () => {
        const precedingText = "text before the command ";
        const followingText = " text after the command";
        expect(findMentionOrCommand(precedingText + command + followingText, precedingText.length + 4)).toBeNull();
    });

    it.each(mentionTestCases)("returns an object if %s is surrounded by text", (mention) => {
        const precedingText = "I want to mention ";
        const followingText = " in my message";
        expect(findMentionOrCommand(precedingText + mention + followingText, precedingText.length + 3)).toEqual({
            text: mention,
            startOffset: precedingText.length,
        });
    });

    it("returns null for text content with an email address", () => {
        const emailInput = "send to user@test.com";
        expect(findMentionOrCommand(emailInput, 15)).toBeNull();
    });

    it("returns null for double slashed command", () => {
        const doubleSlashCommand = "//not a command";
        expect(findMentionOrCommand(doubleSlashCommand, 4)).toBeNull();
    });

    it("returns null for slash separated text", () => {
        const slashSeparatedInput = "please to this/that/the other";
        expect(findMentionOrCommand(slashSeparatedInput, 21)).toBeNull();
    });

    it("returns an object for a mention that contains punctuation", () => {
        const mentionWithPunctuation = "@userX14#5a_-";
        const precedingText = "mention ";
        const mentionInput = precedingText + mentionWithPunctuation;
        expect(findMentionOrCommand(mentionInput, 12)).toEqual({
            text: mentionWithPunctuation,
            startOffset: precedingText.length,
        });
    });

    it("returns null when user inputs any whitespace after the special character", () => {
        const mentionWithSpaceAfter = "@ somebody";
        expect(findMentionOrCommand(mentionWithSpaceAfter, 2)).toBeNull();
    });
});
