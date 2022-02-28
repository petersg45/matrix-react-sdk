/*
Copyright 2019 New Vector Ltd
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

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

import { MatrixEvent } from "matrix-js-sdk/src/models/event";

import { walkDOMDepthFirst } from "./dom";
import { checkBlockNode } from "../HtmlUtils";
import { getPrimaryPermalinkEntity } from "../utils/permalinks/Permalinks";
import { Part, PartCreator, Type } from "./parts";
import SdkConfig from "../SdkConfig";
import { textToHtmlRainbow } from "../utils/colour";

function parseAtRoomMentions(text: string, partCreator: PartCreator): Part[] {
    const ATROOM = "@room";
    const parts: Part[] = [];
    text.split(ATROOM).forEach((textPart, i, arr) => {
        if (textPart.length) {
            parts.push(...partCreator.plainWithEmoji(textPart));
        }
        // it's safe to never append @room after the last textPart
        // as split will report an empty string at the end if
        // `text` ended in @room.
        const isLast = i === arr.length - 1;
        if (!isLast) {
            parts.push(partCreator.atRoomPill(ATROOM));
        }
    });
    return parts;
}

function parseLink(a: HTMLAnchorElement, partCreator: PartCreator): Part[] {
    const { href } = a;
    const resourceId = getPrimaryPermalinkEntity(href); // The room/user ID
    const prefix = resourceId ? resourceId[0] : undefined; // First character of ID
    switch (prefix) {
        case "@":
            return [partCreator.userPill(a.textContent, resourceId)];
        case "#":
            return [partCreator.roomPill(resourceId)];
        default: {
            if (href === a.textContent) {
                return partCreator.plainWithEmoji(a.textContent);
            } else {
                return partCreator.plainWithEmoji(`[${a.textContent.replace(/[[\\\]]/g, c => "\\" + c)}](${href})`);
            }
        }
    }
}

function parseImage(img: HTMLImageElement, partCreator: PartCreator): Part[] {
    const { src } = img;
    return partCreator.plainWithEmoji(`![${img.alt.replace(/[[\\\]]/g, c => "\\" + c)}](${src})`);
}

function parseCodeBlock(n: HTMLElement, partCreator: PartCreator): Part[] {
    const parts: Part[] = [];
    let language = "";
    if (n.firstChild && n.firstChild.nodeName === "CODE") {
        for (const className of (<HTMLElement>n.firstChild).classList) {
            if (className.startsWith("language-") && !className.startsWith("language-_")) {
                language = className.substr("language-".length);
                break;
            }
        }
    }
    const preLines = ("```" + language + "\n" + n.textContent + "```").split("\n");
    preLines.forEach((l, i) => {
        parts.push(...partCreator.plainWithEmoji(l));
        if (i < preLines.length - 1) {
            parts.push(partCreator.newline());
        }
    });
    return parts;
}

function parseHeader(el: HTMLElement, partCreator: PartCreator): Part {
    const depth = parseInt(el.nodeName.substr(1), 10);
    return partCreator.plain("#".repeat(depth) + " ");
}

interface IState {
    listIndex: number[];
    listDepth?: number;
}

function parseElement(
    n: HTMLElement,
    partCreator: PartCreator,
    lastNode: Node | undefined,
    state: IState,
): Part | Part[] {
    switch (n.nodeName) {
        case "H1":
        case "H2":
        case "H3":
        case "H4":
        case "H5":
        case "H6":
            return parseHeader(n, partCreator);
        case "A":
            return parseLink(<HTMLAnchorElement>n, partCreator);
        case "IMG":
            return parseImage(<HTMLImageElement>n, partCreator);
        case "BR":
            return partCreator.newline();
        case "HR":
            // the newline arrangement here is quite specific otherwise it may be misconstrued as marking the previous
            // text line as a header instead of acting as a horizontal rule.
            return [
                partCreator.newline(),
                partCreator.plain("---"),
                partCreator.newline(),
            ];
        case "EM":
            return partCreator.plainWithEmoji(`_${n.textContent}_`);
        case "STRONG":
            return partCreator.plainWithEmoji(`**${n.textContent}**`);
        case "PRE":
            return parseCodeBlock(n, partCreator);
        case "CODE":
            return partCreator.plainWithEmoji(`\`${n.textContent}\``);
        case "DEL":
            return partCreator.plainWithEmoji(`<del>${n.textContent}</del>`);
        case "SUB":
            return partCreator.plainWithEmoji(`<sub>${n.textContent}</sub>`);
        case "SUP":
            return partCreator.plainWithEmoji(`<sup>${n.textContent}</sup>`);
        case "U":
            return partCreator.plainWithEmoji(`<u>${n.textContent}</u>`);
        case "LI": {
            const BASE_INDENT = 4;
            const depth = state.listDepth - 1;
            const indent = " ".repeat(BASE_INDENT * depth);
            if (n.parentElement.nodeName === "OL") {
                // The markdown parser doesn't do nested indexed lists at all, but this supports it anyway.
                const index = state.listIndex[state.listIndex.length - 1];
                state.listIndex[state.listIndex.length - 1] += 1;
                return partCreator.plain(`${indent}${index}. `);
            } else {
                return partCreator.plain(`${indent}- `);
            }
        }
        case "P": {
            if (lastNode) {
                return partCreator.newline();
            }
            break;
        }
        case "DIV":
        case "SPAN": {
            // math nodes are translated back into delimited latex strings
            if (n.hasAttribute("data-mx-maths")) {
                const delimLeft = (n.nodeName == "SPAN") ?
                    ((SdkConfig.get()['latex_maths_delims'] || {})['inline'] || {})['left'] || "\\(" :
                    ((SdkConfig.get()['latex_maths_delims'] || {})['display'] || {})['left'] || "\\[";
                const delimRight = (n.nodeName == "SPAN") ?
                    ((SdkConfig.get()['latex_maths_delims'] || {})['inline'] || {})['right'] || "\\)" :
                    ((SdkConfig.get()['latex_maths_delims'] || {})['display'] || {})['right'] || "\\]";
                const tex = n.getAttribute("data-mx-maths");
                return partCreator.plainWithEmoji(delimLeft + tex + delimRight);
            } else if (!checkDescendInto(n)) {
                return partCreator.plainWithEmoji(n.textContent);
            }
            break;
        }
        case "OL":
            state.listIndex.push((<HTMLOListElement>n).start || 1);
            /* falls through */
        case "UL":
            state.listDepth = (state.listDepth || 0) + 1;
            /* falls through */
        default:
            // don't textify block nodes we'll descend into
            if (!checkDescendInto(n)) {
                return partCreator.plainWithEmoji(n.textContent);
            }
    }
}

function checkDescendInto(node) {
    switch (node.nodeName) {
        case "PRE":
            // a code block is textified in parseCodeBlock
            // as we don't want to preserve markup in it,
            // so no need to descend into it
            return false;
        default:
            return checkBlockNode(node);
    }
}

function checkIgnored(n) {
    if (n.nodeType === Node.TEXT_NODE) {
        // Element adds \n text nodes in a lot of places,
        // which should be ignored
        return n.nodeValue === "\n";
    } else if (n.nodeType === Node.ELEMENT_NODE) {
        return n.nodeName === "MX-REPLY";
    }
    return true;
}

const QUOTE_LINE_PREFIX = "> ";
function prefixQuoteLines(isFirstNode, parts, partCreator) {
    // a newline (to append a > to) wouldn't be added to parts for the first line
    // if there was no content before the BLOCKQUOTE, so handle that
    if (isFirstNode) {
        parts.splice(0, 0, partCreator.plain(QUOTE_LINE_PREFIX));
    }
    for (let i = 0; i < parts.length; i += 1) {
        if (parts[i].type === Type.Newline) {
            parts.splice(i + 1, 0, partCreator.plain(QUOTE_LINE_PREFIX));
            i += 1;
        }
    }
}

function parseHtmlMessage(html: string, partCreator: PartCreator, isQuotedMessage: boolean): Part[] {
    // no nodes from parsing here should be inserted in the document,
    // as scripts in event handlers, etc would be executed then.
    // we're only taking text, so that is fine
    const rootNode = new DOMParser().parseFromString(html, "text/html").body;
    const parts: Part[] = [];
    let lastNode: Node;
    let inQuote = isQuotedMessage;
    const state: IState = {
        listIndex: [],
    };

    function onNodeEnter(n: Node) {
        if (checkIgnored(n)) {
            return false;
        }
        if (n.nodeName === "BLOCKQUOTE") {
            inQuote = true;
        }

        const newParts: Part[] = [];
        if (lastNode && (checkBlockNode(lastNode) || checkBlockNode(n))) {
            newParts.push(partCreator.newline());
        }

        if (n.nodeType === Node.TEXT_NODE) {
            let { nodeValue } = n;

            // Sometimes commonmark adds a newline at the end of the list item text
            if (n.parentNode.nodeName === "LI") {
                nodeValue = nodeValue.trimEnd();
            }
            newParts.push(...parseAtRoomMentions(nodeValue, partCreator));

            const grandParent = n.parentNode.parentNode;
            const isTight = n.parentNode.nodeName !== "P" || grandParent?.nodeName !== "LI";
            if (!isTight) {
                newParts.push(partCreator.newline());
            }
        } else if (n.nodeType === Node.ELEMENT_NODE) {
            const parseResult = parseElement(n as HTMLElement, partCreator, lastNode, state);
            if (parseResult) {
                if (Array.isArray(parseResult)) {
                    newParts.push(...parseResult);
                } else {
                    newParts.push(parseResult);
                }
            }
        }

        if (newParts.length && inQuote) {
            const isFirstPart = parts.length === 0;
            prefixQuoteLines(isFirstPart, newParts, partCreator);
        }

        parts.push(...newParts);

        const descend = checkDescendInto(n);
        // when not descending (like for PRE), onNodeLeave won't be called to set lastNode
        // so do that here.
        lastNode = descend ? null : n;
        return descend;
    }

    function onNodeLeave(n: Node) {
        if (checkIgnored(n)) {
            return;
        }
        switch (n.nodeName) {
            case "BLOCKQUOTE":
                inQuote = false;
                break;
            case "OL":
                state.listIndex.pop();
                /* falls through */
            case "UL":
                state.listDepth -= 1;
                break;
        }
        lastNode = n;
    }

    walkDOMDepthFirst(rootNode, onNodeEnter, onNodeLeave);

    return parts;
}

export function parsePlainTextMessage(body: string, partCreator: PartCreator, isQuotedMessage?: boolean): Part[] {
    const lines = body.split(/\r\n|\r|\n/g); // split on any new-line combination not just \n, collapses \r\n
    return lines.reduce((parts, line, i) => {
        if (isQuotedMessage) {
            parts.push(partCreator.plain(QUOTE_LINE_PREFIX));
        }
        parts.push(...parseAtRoomMentions(line, partCreator));
        const isLast = i === lines.length - 1;
        if (!isLast) {
            parts.push(partCreator.newline());
        }
        return parts;
    }, [] as Part[]);
}

export function parseEvent(event: MatrixEvent, partCreator: PartCreator, { isQuotedMessage = false } = {}) {
    const content = event.getContent();
    let parts: Part[];
    const isEmote = content.msgtype === "m.emote";
    let isRainbow = false;

    if (content.format === "org.matrix.custom.html") {
        parts = parseHtmlMessage(content.formatted_body || "", partCreator, isQuotedMessage);
        if (content.body && content.formatted_body && textToHtmlRainbow(content.body) === content.formatted_body) {
            isRainbow = true;
        }
    } else {
        parts = parsePlainTextMessage(content.body || "", partCreator, isQuotedMessage);
    }

    if (isEmote && isRainbow) {
        parts.unshift(partCreator.plain("/rainbowme "));
    } else if (isRainbow) {
        parts.unshift(partCreator.plain("/rainbow "));
    } else if (isEmote) {
        parts.unshift(partCreator.plain("/me "));
    }

    return parts;
}
