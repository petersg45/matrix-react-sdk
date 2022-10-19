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

import { MatrixClient } from "matrix-js-sdk/src/matrix";
import { createContext } from "react";

import defaultDispatcher from "../dispatcher/dispatcher";
import LegacyCallHandler from "../LegacyCallHandler";
import { PosthogAnalytics } from "../PosthogAnalytics";
import { SlidingSyncManager } from "../SlidingSyncManager";
import { RoomNotificationStateStore } from "../stores/notifications/RoomNotificationStateStore";
import RightPanelStore from "../stores/right-panel/RightPanelStore";
import { RoomViewStore } from "../stores/RoomViewStore";
import SpaceStore, { SpaceStoreClass } from "../stores/spaces/SpaceStore";
import { WidgetLayoutStore } from "../stores/widgets/WidgetLayoutStore";
import WidgetStore from "../stores/WidgetStore";

export const SDKContext = createContext<SdkContextClass>(undefined);
SDKContext.displayName = "SDKContext";

/**
 * A class which lazily initialises stores as and when they are requested, ensuring they remain
 * as singletons scoped to this object.
 */
export class SdkContextClass {
    /**
     * The global SdkContextClass instance. This is a temporary measure whilst so many stores remain global
     * as well. Over time, these stores should accept a `SdkContextClass` instance in their constructor.
     * When all stores do this, this static variable can be deleted.
     */
    public static readonly instance = new SdkContextClass();

    // Optional as we don't have a client on initial load if unregistered. This should be set
    // when the MatrixClient is first acquired in the dispatcher event Action.OnLoggedIn.
    // It is only safe to set this once, as updating this value will NOT notify components using
    // this Context.
    public client?: MatrixClient;

    // All protected fields to make it easier to derive test stores
    protected _RightPanelStore?: RightPanelStore;
    protected _RoomNotificationStateStore?: RoomNotificationStateStore;
    protected _RoomViewStore?: RoomViewStore;
    protected _WidgetLayoutStore?: WidgetLayoutStore;
    protected _WidgetStore?: WidgetStore;
    protected _PosthogAnalytics?: PosthogAnalytics;
    protected _SlidingSyncManager?: SlidingSyncManager;
    protected _SpaceStore?: SpaceStoreClass;
    protected _LegacyCallHandler?: LegacyCallHandler;

    /**
     * Automatically construct stores which need to be created eagerly so they can register with
     * the dispatcher.
     */
    public constructEagerStores() {
        this._RoomViewStore = this.roomViewStore;
    }

    public get legacyCallHandler(): LegacyCallHandler {
        if (!this._LegacyCallHandler) {
            this._LegacyCallHandler = LegacyCallHandler.instance;
        }
        return this._LegacyCallHandler;
    }
    public get rightPanelStore(): RightPanelStore {
        if (!this._RightPanelStore) {
            this._RightPanelStore = RightPanelStore.instance;
        }
        return this._RightPanelStore;
    }
    public get roomNotificationStateStore(): RoomNotificationStateStore {
        if (!this._RoomNotificationStateStore) {
            this._RoomNotificationStateStore = RoomNotificationStateStore.instance;
        }
        return this._RoomNotificationStateStore;
    }
    public get roomViewStore(): RoomViewStore {
        if (!this._RoomViewStore) {
            this._RoomViewStore = new RoomViewStore(
                defaultDispatcher, this,
            );
        }
        return this._RoomViewStore;
    }
    public get widgetLayoutStore(): WidgetLayoutStore {
        if (!this._WidgetLayoutStore) {
            this._WidgetLayoutStore = WidgetLayoutStore.instance;
        }
        return this._WidgetLayoutStore;
    }
    public get widgetStore(): WidgetStore {
        if (!this._WidgetStore) {
            this._WidgetStore = WidgetStore.instance;
        }
        return this._WidgetStore;
    }
    public get posthogAnalytics(): PosthogAnalytics {
        if (!this._PosthogAnalytics) {
            this._PosthogAnalytics = PosthogAnalytics.instance;
        }
        return this._PosthogAnalytics;
    }
    public get slidingSyncManager(): SlidingSyncManager {
        if (!this._SlidingSyncManager) {
            this._SlidingSyncManager = SlidingSyncManager.instance;
        }
        return this._SlidingSyncManager;
    }
    public get spaceStore(): SpaceStoreClass {
        if (!this._SpaceStore) {
            this._SpaceStore = SpaceStore.instance;
        }
        return this._SpaceStore;
    }
}
