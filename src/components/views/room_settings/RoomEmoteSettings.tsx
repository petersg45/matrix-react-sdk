/*
Copyright 2019 New Vector Ltd

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

import React, { createRef } from "react";
import { UnstableValue } from "matrix-js-sdk/src/NamespacedValue";

import { _t } from "../../../languageHandler";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import AccessibleButton from "../elements/AccessibleButton";
import { chromeFileInputFix } from "../../../utils/BrowserWorkarounds";
import { uploadFile } from "../../../ContentMessages";
import { decryptFile } from "../../../utils/DecryptFile";
import { mediaFromMxc } from "../../../customisations/Media";
import SettingsFieldset from "../settings/SettingsFieldset";
import LabelledToggleSwitch from "../elements/LabelledToggleSwitch";
import { IEncryptedFile } from "../../../customisations/models/IMediaEventContent";
const EMOTES_STATE = new UnstableValue("org.matrix.msc3892.emotes", "m.room.emotes");
const COMPAT_STATE = new UnstableValue(
    "org.matrix.msc3892.clientemote_compatibility",
    "m.room.clientemote_compatibility",
);
const EMOTES_COMP = new UnstableValue("im.ponies.room_emotes", "m.room.room_emotes");
const SHORTCODE_REGEX = /[^a-zA-Z0-9_]/g;
interface IProps {
    roomId: string;
}

interface IState {
    emotes: Map<string, Object>;
    decryptedemotes: Map<string, string>;
    EmoteFieldsTouched: Record<string, string>;
    newEmoteFileAdded: boolean;
    newEmoteCodeAdded: boolean;
    newEmoteCode: Array<string>;
    newEmoteFile: Array<File>;
    canAddEmote: boolean;
    deleted: boolean;
    deletedItems: Map<string, Object>;
    value: Map<string, string>;
    compatibility: boolean;
}

export default class RoomEmoteSettings extends React.Component<IProps, IState> {
    private emoteUpload = createRef<HTMLInputElement>();
    private emoteCodeUpload = createRef<HTMLInputElement>();
    private emoteUploadImage = createRef<HTMLImageElement>();
    private imagePack: object;
    public constructor(props: IProps) {
        super(props);

        const client = MatrixClientPeg.get();
        const room = client.getRoom(props.roomId);
        if (!room) throw new Error(`Expected a room for ID: ${props.roomId}`);

        const emotesEvent = room.currentState.getStateEvents(EMOTES_STATE.name, "");
        const emotes = emotesEvent ? emotesEvent.getContent() || {} : {};
        const value = new Map();
        const emotesMap = new Map();
        for (const shortcode in emotes) {
            value.set(shortcode, shortcode);
            emotesMap.set(shortcode, emotes[shortcode]);
        }

        const compatEvent = room.currentState.getStateEvents(COMPAT_STATE.name, "");
        const compat = compatEvent ? compatEvent.getContent().isCompat || false : false;

        const imagePackEvent = room.currentState.getStateEvents(EMOTES_COMP.name, "");
        this.imagePack = imagePackEvent
            ? imagePackEvent.getContent() || { images: new Map<string, object>() }
            : { images: new Map<string, object>() };
        if (!this.imagePack["images"]) {
            this.imagePack = { images: new Map<string, object>() };
        }

        this.state = {
            emotes: emotesMap,
            decryptedemotes: new Map(),
            EmoteFieldsTouched: {},
            newEmoteFileAdded: false,
            newEmoteCodeAdded: false,
            newEmoteCode: [""],
            newEmoteFile: [],
            deleted: false,
            deletedItems: new Map(),
            canAddEmote: room.currentState.maySendStateEvent(EMOTES_STATE.name, client.getUserId()),
            value: value,
            compatibility: compat,
        };
        this.decryptEmotes(client.isRoomEncrypted(props.roomId));
    }
    public componentDidMount(): void {
        const client = MatrixClientPeg.get();
        this.decryptEmotes(client.isRoomEncrypted(this.props.roomId));
    }

    private uploadEmoteClick = (): void => {
        this.emoteUpload.current.click();
    };

    private isSaveEnabled = (): boolean => {
        return (
            Boolean(Object.values(this.state.EmoteFieldsTouched).length) ||
            (this.state.newEmoteCodeAdded && this.state.newEmoteFileAdded) ||
            this.state.deleted
        );
    };

    private cancelEmoteChanges = async (e: React.MouseEvent): Promise<void> => {
        e.stopPropagation();
        e.preventDefault();
        const value = new Map();
        if (this.state.deleted) {
            for (const key in this.state.deletedItems) {
                this.state.emotes.set(key, this.state.deletedItems.get(key));
                value.set(key, key);
            }
        }
        document.querySelectorAll(".mx_EmoteSettings_existingEmoteCode").forEach((field) => {
            value.set((field as HTMLInputElement).id, (field as HTMLInputElement).id);
        });
        if (!this.isSaveEnabled()) return;
        this.setState({
            EmoteFieldsTouched: {},
            newEmoteFileAdded: false,
            newEmoteCodeAdded: false,
            newEmoteCode: [""],
            newEmoteFile: [],
            deleted: false,
            deletedItems: new Map(),
            value: value,
        });
    };
    private deleteEmote = (e: React.MouseEvent): Promise<void> => {
        e.stopPropagation();
        e.preventDefault();
        const cleanemotes = new Map();
        const deletedItems = this.state.deletedItems;
        const value = new Map();
        const id = e.currentTarget.getAttribute("id");
        for (const emote in this.state.emotes) {
            if (emote != id) {
                cleanemotes.set(emote, this.state.emotes.get(emote));
                value.set(emote, emote);
            } else {
                deletedItems.set(emote, this.state.emotes.get(emote));
            }
        }

        this.setState({ deleted: true, emotes: cleanemotes, deletedItems: deletedItems, value: value });
        return;
    };
    private saveEmote = async (e: React.FormEvent): Promise<void> => {
        e.stopPropagation();
        e.preventDefault();

        if (!this.isSaveEnabled()) return;
        const client = MatrixClientPeg.get();
        const newState: Partial<IState> = {};
        const emotesMxcs = {};
        const value = new Map();
        const newPack = { images: new Map<string, object>() };

        if (this.state.emotes || (this.state.newEmoteFileAdded && this.state.newEmoteCodeAdded)) {
            if (this.state.newEmoteFileAdded && this.state.newEmoteCodeAdded) {
                for (let i = 0; i < this.state.newEmoteCode.length; i++) {
                    const newEmote = await uploadFile(client, this.props.roomId, this.state.newEmoteFile[i]);
                    if (client.isRoomEncrypted(this.props.roomId)) {
                        emotesMxcs[this.state.newEmoteCode[i]] = newEmote.file;
                    } else {
                        emotesMxcs[this.state.newEmoteCode[i]] = newEmote.url;
                    }
                    value[this.state.newEmoteCode[i]] = this.state.newEmoteCode[i];
                    if (this.state.compatibility) {
                        if (client.isRoomEncrypted(this.props.roomId)) {
                            const compatNewEmote = await client.uploadContent(this.state.newEmoteFile[i]);
                            newPack["images"][this.state.newEmoteCode[i]] = { url: compatNewEmote.content_uri };
                        } else {
                            newPack["images"][this.state.newEmoteCode[i]] = { url: newEmote.url };
                        }
                    }
                }
            }
            if (this.state.emotes) {
                for (const [shortcode, val] of this.state.emotes) {
                    if (
                        this.state.newEmoteFileAdded &&
                        this.state.newEmoteCodeAdded &&
                        shortcode in this.state.newEmoteCode
                    ) {
                        continue;
                    }
                    if (this.state.EmoteFieldsTouched.hasOwnProperty(shortcode)) {
                        emotesMxcs[this.state.EmoteFieldsTouched[shortcode]] = val;
                        value.set(this.state.EmoteFieldsTouched[shortcode], this.state.EmoteFieldsTouched[shortcode]);
                        if (this.imagePack["images"][shortcode]) {
                            newPack["images"][this.state.EmoteFieldsTouched[shortcode]] = {
                                url: this.imagePack["images"][shortcode]["url"],
                            };
                        }
                    } else {
                        emotesMxcs[shortcode] = val;
                        value.set(shortcode, shortcode);
                        if (this.imagePack["images"].get(shortcode)) {
                            newPack["images"][shortcode] = { url: this.imagePack["images"][shortcode]["url"] };
                        }
                    }
                }
            }
            newState.value = value;
            await client.sendStateEvent(this.props.roomId, EMOTES_STATE.name, emotesMxcs, "");
            this.imagePack = newPack;
            await client.sendStateEvent(this.props.roomId, EMOTES_COMP.name, this.imagePack, "");

            newState.newEmoteFileAdded = false;
            newState.newEmoteCodeAdded = false;
            newState.EmoteFieldsTouched = {};
            newState.emotes = new Map();
            for (const shortcode in emotesMxcs) {
                newState.emotes.set(shortcode, emotesMxcs[shortcode]);
            }
            newState.deleted = false;
            newState.deletedItems = new Map();
            newState.newEmoteCode = [""];
            newState.newEmoteFile = [];
        }
        this.setState(newState as IState);
        this.decryptEmotes(client.isRoomEncrypted(this.props.roomId));
    };

    private onEmoteChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const id = e.target.getAttribute("id");
        const b = this.state.value;
        b.set(id, e.target.value.replace(SHORTCODE_REGEX, ""));
        this.setState({
            value: b,
            EmoteFieldsTouched: { ...this.state.EmoteFieldsTouched, [id]: e.target.value.replace(SHORTCODE_REGEX, "") },
        });
    };

    private onEmoteFileAdd = (e: React.ChangeEvent<HTMLInputElement>): void => {
        if (!e.target.files || !e.target.files.length) {
            this.setState({
                newEmoteFileAdded: false,
                EmoteFieldsTouched: {
                    ...this.state.EmoteFieldsTouched,
                },
            });
            return;
        }

        const uploadedFiles = [];
        const newCodes = [];
        for (const file of e.target.files) {
            const fileName = file.name.replace(/\.[^.]*$/, "");
            uploadedFiles.push(file);
            newCodes.push(fileName);
        }
        this.setState({
            newEmoteCodeAdded: true,
            newEmoteFileAdded: true,
            newEmoteCode: newCodes,
            newEmoteFile: uploadedFiles,
            EmoteFieldsTouched: {
                ...this.state.EmoteFieldsTouched,
            },
        });
    };
    private onEmoteCodeAdd = (e: React.ChangeEvent<HTMLInputElement>): void => {
        if (e.target.value.replace(SHORTCODE_REGEX, "").length > 0) {
            const updatedCode = this.state.newEmoteCode;
            updatedCode[e.target.getAttribute("data-index")] = e.target.value.replace(SHORTCODE_REGEX, "");
            this.setState({
                newEmoteCodeAdded: true,
                newEmoteCode: updatedCode,
                EmoteFieldsTouched: {
                    ...this.state.EmoteFieldsTouched,
                },
            });
        } else {
            const updatedCode = this.state.newEmoteCode;
            updatedCode[e.target.getAttribute("data-index")] = e.target.value.replace(SHORTCODE_REGEX, "");
            this.setState({
                newEmoteCodeAdded: false,
                newEmoteCode: updatedCode,
            });
        }
    };

    private onCompatChange = async (allowed: boolean): Promise<void> => {
        const client = MatrixClientPeg.get();
        await client.sendStateEvent(this.props.roomId, COMPAT_STATE.name, { isCompat: allowed }, "");

        if (allowed) {
            for (const [shortcode, val] of this.state.emotes) {
                if (!this.imagePack["images"][shortcode]) {
                    if (client.isRoomEncrypted(this.props.roomId)) {
                        const blob = await decryptFile(val as IEncryptedFile);
                        const uploadedEmote = await client.uploadContent(blob);
                        this.imagePack["images"][shortcode] = { url: uploadedEmote.content_uri };
                    } else {
                        this.imagePack["images"][shortcode] = { url: val };
                    }
                }
            }

            await client.sendStateEvent(this.props.roomId, EMOTES_COMP.name, this.imagePack, "");
        }

        this.setState({
            compatibility: allowed,
        });
    };
    private async decryptEmotes(isEnc: boolean): Promise<void> {
        const decryptedemotes = new Map();
        for (const [shortcode, val] of this.state.emotes) {
            if (isEnc) {
                const blob = await decryptFile(val as IEncryptedFile);
                decryptedemotes.set(shortcode, URL.createObjectURL(blob));
            } else {
                decryptedemotes.set(shortcode, mediaFromMxc(val as string).srcHttp);
            }
        }
        this.setState({
            decryptedemotes: decryptedemotes,
        });
    }
    public render(): JSX.Element {
        let emoteSettingsButtons;
        if (this.state.canAddEmote) {
            emoteSettingsButtons = (
                <div className="mx_EmoteSettings_buttons">
                    <AccessibleButton onClick={this.cancelEmoteChanges} kind="link" disabled={!this.isSaveEnabled()}>
                        {_t("Cancel")}
                    </AccessibleButton>
                    <AccessibleButton onClick={this.saveEmote} kind="primary" disabled={!this.isSaveEnabled()}>
                        {_t("Save")}
                    </AccessibleButton>
                </div>
            );
        }

        const existingEmotes = [];
        if (this.state.emotes) {
            for (const [emotecode, val] of this.state.decryptedemotes) {
                existingEmotes.push(
                    <li className="mx_EmoteSettings_addEmoteField">
                        <input
                            type="text"
                            id={emotecode}
                            value={this.state.value.get(emotecode)}
                            onChange={this.onEmoteChange}
                            className="mx_EmoteSettings_existingEmoteCode"
                        />
                        <img alt={":" + emotecode + ":"} className="mx_EmoteSettings_uploadedEmoteImage" src={val} />
                        <div className="mx_EmoteSettings_uploadButton">
                            <AccessibleButton
                                onClick={this.deleteEmote}
                                className=""
                                kind="danger_outline"
                                aria-label="Close"
                                id={emotecode}
                            >
                                {_t("Delete")}
                            </AccessibleButton>
                        </div>
                    </li>,
                );
            }
        }

        let emoteUploadButton;
        if (this.state.canAddEmote) {
            emoteUploadButton = (
                <div className="mx_EmoteSettings_uploadButton">
                    <AccessibleButton onClick={this.uploadEmoteClick} kind="primary">
                        {_t("Upload Emote")}
                    </AccessibleButton>
                </div>
            );
        }

        const uploadedEmotes = [];
        for (let i = 0; i < this.state.newEmoteCode.length; i++) {
            const fileUrl = this.state.newEmoteFile[i] ? URL.createObjectURL(this.state.newEmoteFile[i]) : "";
            uploadedEmotes.push(
                <li className="mx_EmoteSettings_addEmoteField">
                    <input
                        ref={this.emoteCodeUpload}
                        type="text"
                        autoComplete="off"
                        placeholder=":emote:"
                        value={this.state.newEmoteCode[i]}
                        data-index={i}
                        className="mx_EmoteSettings_emoteField"
                        onChange={this.onEmoteCodeAdd}
                    />
                    {this.state.newEmoteFileAdded ? (
                        <img
                            src={fileUrl}
                            ref={this.emoteUploadImage}
                            className="mx_EmoteSettings_uploadedEmoteImage"
                            alt={":" + this.state.newEmoteCode[i] + ":"}
                        />
                    ) : null}

                    {i == 0 ? emoteUploadButton : null}
                </li>,
            );
        }
        const isCompat = this.state.compatibility;
        return (
            <form onSubmit={this.saveEmote} autoComplete="off" noValidate={true} className="mx_EmoteSettings">
                <input
                    type="file"
                    ref={this.emoteUpload}
                    className="mx_EmoteSettings_emoteUpload"
                    onClick={chromeFileInputFix}
                    onChange={this.onEmoteFileAdd}
                    accept="image/*"
                    multiple
                />
                {emoteSettingsButtons}
                <SettingsFieldset
                    legend={_t("Emote Compatibility on Other Clients")}
                    description={_t(
                        "This will allow emotes sent to be compatible with non-Element clients that have custom emotes. \nThis uses a different spec and emote images will be stored on the server unencrypted. Emotes sent before this setting is enabled will not work on the other clients. \nThe room will have to be reloaded for this change to take effect. \nNOTE: The first time you turn this setting on in an encrypted room it may take some time so please be patient and wait until the toggle switch shows that it is on.",
                    )}
                >
                    <LabelledToggleSwitch
                        value={isCompat}
                        onChange={this.onCompatChange}
                        label={_t("Compatibility")}
                        disabled={!this.state.canAddEmote}
                    />
                </SettingsFieldset>
                {uploadedEmotes}
                {existingEmotes}
            </form>
        );
    }
}
