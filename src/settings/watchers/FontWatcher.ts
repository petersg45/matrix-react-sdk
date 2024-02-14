/*
Copyright 2020 - 2023 The Matrix.org Foundation C.I.C.

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

import dis from "../../dispatcher/dispatcher";
import SettingsStore from "../SettingsStore";
import IWatcher from "./Watcher";
import { toPx } from "../../utils/units";
import { Action } from "../../dispatcher/actions";
import { SettingLevel } from "../SettingLevel";
import { UpdateSystemFontPayload } from "../../dispatcher/payloads/UpdateSystemFontPayload";
import { ActionPayload } from "../../dispatcher/payloads";
import { clamp } from "../../utils/numbers";

export class FontWatcher implements IWatcher {
    /**
     * This Compound value is using `100%` of the default browser font size.
     * It allows EW to use the browser's default font size instead of a fixed value.
     * All the Compound font size are using `rem`, they are relative to the root font size
     * and therefore of the browser font size.
     */
    private static readonly DEFAULT_SIZE = "var(--cpd-font-size-root)";
    /**
     * Default delta added to the ${@link DEFAULT_SIZE}
     */
    public static readonly DEFAULT_DELTA = 0;
    /**
     * The lowest value that can be added to the ${@link DEFAULT_SIZE}
     */
    public static readonly MIN_DELTA = -5;
    /**
     * The highest value that can be added to the ${@link DEFAULT_SIZE}
     */
    public static readonly MAX_DELTA = 5;

    private dispatcherRef: string | null;

    public constructor() {
        this.dispatcherRef = null;
    }

    public async start(): Promise<void> {
        this.updateFont();
        this.dispatcherRef = dis.register(this.onAction);
        /**
         * baseFontSize is an account level setting which is loaded after the initial
         * sync. Hence why we can't do that in the `constructor`
         */
        await this.migrateBaseFontSize();
    }

    /**
     * Migrate the base font size from the V1 and V2 version to the V3 version
     * @private
     */
    private async migrateBaseFontSize(): Promise<void> {
        await this.migrateBaseFontV1toV3();
        await this.migrateBaseFontV2toV3();
    }

    /**
     * Migrating from the V1 version of the base font size to the V3 version
     * The V3 is using the default browser font size as a base
     * Everything will become slightly larger, and getting rid of the `SIZE_DIFF`
     * weirdness for locally persisted values
     * @private
     */
    private async migrateBaseFontV1toV3(): Promise<void> {
        const legacyBaseFontSize = SettingsStore.getValue<number>("baseFontSize");
        // No baseFontV1 found, nothing to migrate
        if (!legacyBaseFontSize) return;

        console.log(
            "Migrating base font size -> base font size V2 -> base font size V3 for Compound, current value",
            legacyBaseFontSize,
        );

        // Compute the new font size of the V2 version before migrating to V3
        const baseFontSizeV2 = this.computeBaseFontSizeV1toV2(legacyBaseFontSize);

        // Compute the difference between the V2 and the V3 version
        const deltaV3 = this.computeFontSizeDeltaFromV2BaseFont(baseFontSizeV2);

        await SettingsStore.setValue("baseFontSizeV3", null, SettingLevel.DEVICE, deltaV3);
        await SettingsStore.setValue("baseFontSize", null, SettingLevel.DEVICE, 0);
        console.log("Migration complete, deleting legacy `baseFontSize`");
    }

    /**
     * Migrating from the V2 version of the base font size to the V3 version
     * @private
     */
    private async migrateBaseFontV2toV3(): Promise<void> {
        const legacyBaseFontV2Size = SettingsStore.getValue<number>("baseFontSizeV2");
        // No baseFontV2 found, nothing to migrate
        if (!legacyBaseFontV2Size) return;

        console.log("Migrating base font size V2 for Compound, current value", legacyBaseFontV2Size);

        // Compute the difference between the V2 and the V3 version
        const deltaV3 = this.computeFontSizeDeltaFromV2BaseFont(legacyBaseFontV2Size);

        await SettingsStore.setValue("baseFontSizeV3", null, SettingLevel.DEVICE, deltaV3);
        await SettingsStore.setValue("baseFontSizeV2", null, SettingLevel.DEVICE, 0);
        console.log("Migration complete, deleting legacy `baseFontSizeV2`");
    }

    /**
     * Compute the V2 font size from the V1 font size
     * @param legacyBaseFontSize
     * @private
     */
    private computeBaseFontSizeV1toV2(legacyBaseFontSize: number): number {
        // For some odd reason, the persisted value in user storage has an offset
        // of 5 pixels for all values stored under `baseFontSize`
        const LEGACY_SIZE_DIFF = 5;

        // Compound uses a base font size of `16px`, whereas the old Element
        // styles based their calculations off a `15px` root font size.
        const ROOT_FONT_SIZE_INCREASE = 1;

        // Compute the font size of the V2 version before migrating to V3
        return legacyBaseFontSize + ROOT_FONT_SIZE_INCREASE + LEGACY_SIZE_DIFF;
    }

    /**
     * Compute the difference between the V2 font size and the default browser font size
     * @param legacyBaseFontV2Size
     * @private
     */
    private computeFontSizeDeltaFromV2BaseFont(legacyBaseFontV2Size: number): number {
        const browserDefaultFontSize = this.getBrowserDefaultFontSize();

        // Compute the difference between the V2 font size and the default browser font size
        return legacyBaseFontV2Size - browserDefaultFontSize;
    }

    /**
     * Get the default font size of the browser
     * Fallback to 16px if the value is not found
     * @private
     * @returns {number} the value of ${@link DEFAULT_SIZE} in pixels
     */
    private getBrowserDefaultFontSize(): number {
        return parseInt(window.getComputedStyle(document.documentElement).getPropertyValue("font-size"), 10) || 16;
    }

    public stop(): void {
        if (!this.dispatcherRef) return;
        dis.unregister(this.dispatcherRef);
    }

    private updateFont(): void {
        this.setRootFontSize(SettingsStore.getValue<number>("baseFontSizeV3"));
        this.setSystemFont({
            useBundledEmojiFont: SettingsStore.getValue("useBundledEmojiFont"),
            useSystemFont: SettingsStore.getValue("useSystemFont"),
            font: SettingsStore.getValue("systemFont"),
        });
    }

    private onAction = (payload: ActionPayload): void => {
        if (payload.action === Action.MigrateBaseFontSize) {
            // TODO Migration to v3
            this.migrateBaseFontSize();
        } else if (payload.action === Action.UpdateFontSizeDeltaSize) {
            this.setRootFontSize(payload.delta);
        } else if (payload.action === Action.UpdateSystemFont) {
            this.setSystemFont(payload as UpdateSystemFontPayload);
        } else if (payload.action === Action.OnLoggedOut) {
            // Clear font overrides when logging out
            this.setRootFontSize(FontWatcher.DEFAULT_DELTA);
            this.setSystemFont({
                useBundledEmojiFont: false,
                useSystemFont: false,
                font: "",
            });
        } else if (payload.action === Action.OnLoggedIn) {
            // Font size can be saved on the account, so grab value when logging in
            this.updateFont();
        }
    };

    /**
     * Set the root font size of the document
     * @param delta {number} the delta to add to the default font size
     */
    private setRootFontSize = async (delta: number): Promise<void> => {
        // Check that the new delta doesn't exceed the limits
        const fontDelta = clamp(delta, FontWatcher.MIN_DELTA, FontWatcher.MAX_DELTA);

        if (fontDelta !== delta) {
            await SettingsStore.setValue("baseFontSizeV3", null, SettingLevel.DEVICE, fontDelta);
        }

        // Add the delta to the browser default font size
        document.querySelector<HTMLElement>(":root")!.style.fontSize =
            `calc(${FontWatcher.DEFAULT_SIZE} + ${toPx(fontDelta)})`;
    };

    public static readonly FONT_FAMILY_CUSTOM_PROPERTY = "--cpd-font-family-sans";
    public static readonly EMOJI_FONT_FAMILY_CUSTOM_PROPERTY = "--emoji-font-family";
    public static readonly BUNDLED_EMOJI_FONT = "Twemoji";

    private setSystemFont = ({
        useBundledEmojiFont,
        useSystemFont,
        font,
    }: Pick<UpdateSystemFontPayload, "useBundledEmojiFont" | "useSystemFont" | "font">): void => {
        if (useSystemFont) {
            let fontString = font
                .split(",")
                .map((font) => {
                    font = font.trim();
                    if (!font.startsWith('"') && !font.endsWith('"')) {
                        font = `"${font}"`;
                    }
                    return font;
                })
                .join(",");

            if (useBundledEmojiFont) {
                fontString += ", " + FontWatcher.BUNDLED_EMOJI_FONT;
            }

            /**
             * Overrides the default font family from Compound
             * Make sure that fonts with spaces in their names get interpreted properly
             */
            document.body.style.setProperty(FontWatcher.FONT_FAMILY_CUSTOM_PROPERTY, fontString);
        } else {
            document.body.style.removeProperty(FontWatcher.FONT_FAMILY_CUSTOM_PROPERTY);

            if (useBundledEmojiFont) {
                document.body.style.setProperty(
                    FontWatcher.EMOJI_FONT_FAMILY_CUSTOM_PROPERTY,
                    FontWatcher.BUNDLED_EMOJI_FONT,
                );
            } else {
                document.body.style.removeProperty(FontWatcher.EMOJI_FONT_FAMILY_CUSTOM_PROPERTY);
            }
        }
    };
}
