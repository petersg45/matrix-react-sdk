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

import { IInvite3PID } from "matrix-js-sdk/src/@types/requests";
import { ClientEvent, MatrixClient, PendingEventOrdering } from "matrix-js-sdk/src/client";
import { EventType } from "matrix-js-sdk/src/matrix";
import { MatrixEvent } from "matrix-js-sdk/src/models/event";
import { KNOWN_SAFE_ROOM_VERSION, Room } from "matrix-js-sdk/src/models/room";
import { MEGOLM_ALGORITHM } from "matrix-js-sdk/src/crypto/olmlib";

import createRoom, { canEncryptToAllUsers } from "../createRoom";
import { Action } from "../dispatcher/actions";
import { ViewRoomPayload } from "../dispatcher/payloads/ViewRoomPayload";
import { getAddressType } from "../UserAddress";
import DMRoomMap from "./DMRoomMap";
import { isJoinedOrNearlyJoined } from "./membership";
import dis from "../dispatcher/dispatcher";
import { privateShouldBeEncrypted } from "./rooms";
import { LocalRoom, LocalRoomState, LOCAL_ROOM_ID_PREFIX } from '../models/LocalRoom';

export function findDMForUser(client: MatrixClient, userId: string): Room {
    const roomIds = DMRoomMap.shared().getDMRoomsForUserId(userId);
    const rooms = roomIds.map(id => client.getRoom(id));
    const suitableDMRooms = rooms.filter(r => {
        // Validate that we are joined and the other person is also joined. We'll also make sure
        // that the room also looks like a DM (until we have canonical DMs to tell us). For now,
        // a DM is a room of two people that contains those two people exactly. This does mean
        // that bots, assistants, etc will ruin a room's DM-ness, though this is a problem for
        // canonical DMs to solve.
        if (r && r.getMyMembership() === "join") {
            const members = r.currentState.getMembers();
            const joinedMembers = members.filter(m => isJoinedOrNearlyJoined(m.membership));
            const otherMember = joinedMembers.find(m => m.userId === userId);
            return otherMember && joinedMembers.length === 2;
        }
        return false;
    }).sort((r1, r2) => {
        return r2.getLastActiveTimestamp() -
            r1.getLastActiveTimestamp();
    });
    if (suitableDMRooms.length) {
        return suitableDMRooms[0];
    }
}

export function findDMRoom(client: MatrixClient, targets: Member[]): Room | null {
    const targetIds = targets.map(t => t.userId);
    let existingRoom: Room;
    if (targetIds.length === 1) {
        existingRoom = findDMForUser(client, targetIds[0]);
    } else {
        existingRoom = DMRoomMap.shared().getDMRoomForIdentifiers(targetIds);
    }
    if (existingRoom && !(existingRoom instanceof LocalRoom)) {
        return existingRoom;
    }
    return null;
}

export async function startDmOnFirstMessage(
    client: MatrixClient,
    targets: Member[],
): Promise<Room> {
    const existingRoom = findDMRoom(client, targets);
    if (existingRoom) {
        dis.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: existingRoom.roomId,
            should_peek: false,
            joining: false,
            metricsTrigger: "MessageUser",
        });
        return existingRoom;
    }

    const room = await createDmLocalRoom(client, targets);
    dis.dispatch({
        action: Action.ViewLocalRoom,
        room_id: room.roomId,
        joining: false,
        targets,
    });
    return room;
}

export async function createDmLocalRoom(
    client: MatrixClient,
    targets: Member[],
): Promise<Room> {
    const userId = client.getUserId();

    const localRoom = new LocalRoom(
        LOCAL_ROOM_ID_PREFIX + client.makeTxnId(),
        client,
        userId,
        {
            pendingEventOrdering: PendingEventOrdering.Detached,
            unstableClientRelationAggregation: true,
        },
    );
    const events = [];

    events.push(new MatrixEvent({
        event_id: `~${localRoom.roomId}:${client.makeTxnId()}`,
        type: EventType.RoomCreate,
        content: {
            creator: userId,
            room_version: KNOWN_SAFE_ROOM_VERSION,
        },
        state_key: "",
        user_id: userId,
        sender: userId,
        room_id: localRoom.roomId,
        origin_server_ts: new Date().getTime(),
    }));

    if (await determineCreateRoomEncryptionOption(client, targets)) {
        events.push(
            new MatrixEvent({
                event_id: `~${localRoom.roomId}:${client.makeTxnId()}`,
                type: EventType.RoomEncryption,
                content: {
                    algorithm: MEGOLM_ALGORITHM,
                },
                user_id: userId,
                sender: userId,
                state_key: "",
                room_id: localRoom.roomId,
                origin_server_ts: Date.now(),
            }),
        );
    }

    events.push(new MatrixEvent({
        event_id: `~${localRoom.roomId}:${client.makeTxnId()}`,
        type: EventType.RoomMember,
        content: {
            displayname: userId,
            membership: "join",
        },
        state_key: userId,
        user_id: userId,
        sender: userId,
        room_id: localRoom.roomId,
    }));

    targets.forEach((target: Member) => {
        events.push(new MatrixEvent({
            event_id: `~${localRoom.roomId}:${client.makeTxnId()}`,
            type: EventType.RoomMember,
            content: {
                displayname: target.name,
                avatar_url: target.getMxcAvatarUrl(),
                membership: "invite",
                isDirect: true,
            },
            state_key: target.userId,
            sender: userId,
            room_id: localRoom.roomId,
        }));
        events.push(new MatrixEvent({
            event_id: `~${localRoom.roomId}:${client.makeTxnId()}`,
            type: EventType.RoomMember,
            content: {
                displayname: target.name,
                avatar_url: target.getMxcAvatarUrl(),
                membership: "join",
            },
            state_key: target.userId,
            sender: target.userId,
            room_id: localRoom.roomId,
        }));
    });

    localRoom.targets = targets;
    localRoom.updateMyMembership("join");
    localRoom.addLiveEvents(events);
    localRoom.currentState.setStateEvents(events);
    localRoom.name = localRoom.getDefaultRoomName(userId);

    client.store.storeRoom(localRoom);
    client.sessionStore.store.setItem('mx_pending_events_local_room', []);

    return localRoom;
}

async function determineCreateRoomEncryptionOption(client: MatrixClient, targets: Member[]): Promise<boolean> {
    if (privateShouldBeEncrypted()) {
        // Check whether all users have uploaded device keys before.
        // If so, enable encryption in the new room.
        const has3PidMembers = targets.some(t => t instanceof ThreepidMember);
        if (!has3PidMembers) {
            const targetIds = targets.map(t => t.userId);
            const allHaveDeviceKeys = await canEncryptToAllUsers(client, targetIds);
            if (allHaveDeviceKeys) {
                return true;
            }
        }
    }

    return false;
}

async function applyAfterCreateCallbacks(
    client: MatrixClient,
    localRoom: LocalRoom,
    roomId: string,
) {
    for (const afterCreateCallback of localRoom.afterCreateCallbacks) {
        await afterCreateCallback(client, roomId);
    }

    localRoom.afterCreateCallbacks = [];
}

/*
function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
*/

export async function createRoomFromLocalRoom(client: MatrixClient, localRoom: LocalRoom) {
    if (!localRoom.isNew) {
        return;
    }

    localRoom.state = LocalRoomState.CREATING;
    client.emit(ClientEvent.Room, localRoom);
    //await timeout(600000);

    const roomId = await startDm(client, localRoom.targets);
    await applyAfterCreateCallbacks(client, localRoom, roomId);
    localRoom.state = LocalRoomState.CREATED;
}

/**
 * Start a DM.
 *
 * @returns {Promise<string | null} Resolves to the room id.
 */
export async function startDm(client: MatrixClient, targets: Member[]): Promise<string | null> {
    const targetIds = targets.map(t => t.userId);

    // Check if there is already a DM with these people and reuse it if possible.
    let existingRoom: Room;
    if (targetIds.length === 1) {
        existingRoom = findDMForUser(client, targetIds[0]);
    } else {
        existingRoom = DMRoomMap.shared().getDMRoomForIdentifiers(targetIds);
    }
    if (existingRoom && !(existingRoom instanceof LocalRoom)) {
        dis.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            room_id: existingRoom.roomId,
            should_peek: false,
            joining: false,
            metricsTrigger: "MessageUser",
        });
        return Promise.resolve(existingRoom.roomId);
    }

    const createRoomOptions = { inlineErrors: true } as any; // XXX: Type out `createRoomOptions`

    if (await determineCreateRoomEncryptionOption(client, targets)) {
        createRoomOptions.encryption = true;
    }

    // Check if it's a traditional DM and create the room if required.
    // TODO: [Canonical DMs] Remove this check and instead just create the multi-person DM
    const isSelf = targetIds.length === 1 && targetIds[0] === client.getUserId();
    if (targetIds.length === 1 && !isSelf) {
        createRoomOptions.dmUserId = targetIds[0];
    }

    if (targetIds.length > 1) {
        createRoomOptions.createOpts = targetIds.reduce(
            (roomOptions, address) => {
                const type = getAddressType(address);
                if (type === 'email') {
                    const invite: IInvite3PID = {
                        id_server: client.getIdentityServerUrl(true),
                        medium: 'email',
                        address,
                    };
                    roomOptions.invite_3pid.push(invite);
                } else if (type === 'mx-user-id') {
                    roomOptions.invite.push(address);
                }
                return roomOptions;
            },
            { invite: [], invite_3pid: [] },
        );
    }

    // MiW
    //createRoomOptions.andView = false;
    createRoomOptions.spinner = false;

    return createRoom(createRoomOptions);
}

// This is the interface that is expected by various components in the Invite Dialog and RoomInvite.
// It is a bit awkward because it also matches the RoomMember class from the js-sdk with some extra support
// for 3PIDs/email addresses.
export abstract class Member {
    /**
     * The display name of this Member. For users this should be their profile's display
     * name or user ID if none set. For 3PIDs this should be the 3PID address (email).
     */
    public abstract get name(): string;

    /**
     * The ID of this Member. For users this should be their user ID. For 3PIDs this should
     * be the 3PID address (email).
     */
    public abstract get userId(): string;

    /**
     * Gets the MXC URL of this Member's avatar. For users this should be their profile's
     * avatar MXC URL or null if none set. For 3PIDs this should always be null.
     */
    public abstract getMxcAvatarUrl(): string;
}

export class DirectoryMember extends Member {
    private readonly _userId: string;
    private readonly displayName?: string;
    private readonly avatarUrl?: string;

    // eslint-disable-next-line camelcase
    constructor(userDirResult: { user_id: string, display_name?: string, avatar_url?: string }) {
        super();
        this._userId = userDirResult.user_id;
        this.displayName = userDirResult.display_name;
        this.avatarUrl = userDirResult.avatar_url;
    }

    // These next class members are for the Member interface
    get name(): string {
        return this.displayName || this._userId;
    }

    get userId(): string {
        return this._userId;
    }

    getMxcAvatarUrl(): string {
        return this.avatarUrl;
    }
}

export class ThreepidMember extends Member {
    private readonly id: string;

    constructor(id: string) {
        super();
        this.id = id;
    }

    // This is a getter that would be falsy on all other implementations. Until we have
    // better type support in the react-sdk we can use this trick to determine the kind
    // of 3PID we're dealing with, if any.
    get isEmail(): boolean {
        return this.id.includes('@');
    }

    // These next class members are for the Member interface
    get name(): string {
        return this.id;
    }

    get userId(): string {
        return this.id;
    }

    getMxcAvatarUrl(): string {
        return null;
    }
}

export interface IDMUserTileProps {
    member: Member;
    onRemove(member: Member): void;
}
