/*
 * Copyright 2024 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { ChangeEvent, Dispatch, JSX, useMemo, useRef, useState } from "react";
import {
    InlineField,
    ToggleControl,
    Label,
    Root,
    RadioControl,
    Text,
    EditInPlace,
    IconButton,
} from "@vector-im/compound-web";
import { Icon as DeleteIcon } from "@vector-im/compound-design-tokens/icons/delete.svg";
import classNames from "classnames";

import { _t } from "../../../languageHandler";
import SettingsSubsection from "./shared/SettingsSubsection";
import ThemeWatcher from "../../../settings/watchers/ThemeWatcher";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import dis from "../../../dispatcher/dispatcher";
import { RecheckThemePayload } from "../../../dispatcher/payloads/RecheckThemePayload";
import { Action } from "../../../dispatcher/actions";
import { useTheme } from "../../../hooks/useTheme";
import { findHighContrastTheme, getOrderedThemes, CustomTheme as CustomThemeType, ITheme } from "../../../theme";
import { useSettingValue } from "../../../hooks/useSettings";
import { logger } from "../../../../../matrix-js-sdk/src/logger";

/**
 * Interface for the theme state
 */
interface ThemeState {
    /* The theme */
    theme: string;
    /* Whether the system theme is activated */
    systemThemeActivated: boolean;
}

/**
 * Hook to fetch the value of the theme and dynamically update when it changes
 */
function useThemeState(): [ThemeState, Dispatch<React.SetStateAction<ThemeState>>] {
    const theme = useTheme();
    const [themeState, setThemeState] = useState<ThemeState>(theme);

    return [themeState, setThemeState];
}

/**
 * Panel to choose the theme
 */
export function ThemeChoicePanel(): JSX.Element {
    const [themeState, setThemeState] = useThemeState();
    const themeWatcher = useRef(new ThemeWatcher());
    const customThemeEnabled = useSettingValue<boolean>("feature_custom_themes");

    return (
        <SettingsSubsection heading={_t("common|theme")} newUi={true}>
            {themeWatcher.current.isSystemThemeSupported() && (
                <SystemTheme
                    systemThemeActivated={themeState.systemThemeActivated}
                    onChange={(systemThemeActivated) =>
                        setThemeState((_themeState) => ({ ..._themeState, systemThemeActivated }))
                    }
                />
            )}
            <ThemeSelectors
                theme={themeState.theme}
                disabled={themeState.systemThemeActivated}
                onChange={(theme) => setThemeState((_themeState) => ({ ..._themeState, theme }))}
            />
            {customThemeEnabled && <CustomTheme />}
        </SettingsSubsection>
    );
}

/**
 * Component to toggle the system theme
 */
interface SystemThemeProps {
    /* Whether the system theme is activated */
    systemThemeActivated: boolean;
    /* Callback when the system theme is toggled */
    onChange: (systemThemeActivated: boolean) => void;
}

/**
 * Component to toggle the system theme
 */
function SystemTheme({ systemThemeActivated, onChange }: SystemThemeProps): JSX.Element {
    return (
        <Root
            onChange={async (evt) => {
                const checked = new FormData(evt.currentTarget).get("systemTheme") === "on";
                onChange(checked);
                await SettingsStore.setValue("use_system_theme", null, SettingLevel.DEVICE, checked);
                dis.dispatch<RecheckThemePayload>({ action: Action.RecheckTheme });
            }}
        >
            <InlineField
                name="systemTheme"
                control={<ToggleControl name="systemTheme" defaultChecked={systemThemeActivated} />}
            >
                <Label>{SettingsStore.getDisplayName("use_system_theme")}</Label>
            </InlineField>
        </Root>
    );
}

/**
 * Component to select the theme
 */
interface ThemeSelectorProps {
    /* The current theme */
    theme: string;
    /* The theme can't be selected */
    disabled: boolean;
    /* Callback when the theme is changed */
    onChange: (theme: string) => void;
}

/**
 * Component to select the theme
 */
function ThemeSelectors({ theme, disabled, onChange }: ThemeSelectorProps): JSX.Element {
    const themes = useThemes();

    return (
        <Root
            className="mx_ThemeChoicePanel_ThemeSelectors"
            onChange={async (evt) => {
                // We don't have any file in the form, we can cast it as string safely
                const newTheme = new FormData(evt.currentTarget).get("themeSelector") as string | null;

                // Do nothing if the same theme is selected
                if (!newTheme || theme === newTheme) return;

                // doing getValue in the .catch will still return the value we failed to set,
                // so remember what the value was before we tried to set it so we can revert
                const oldTheme = SettingsStore.getValue<string>("theme");
                SettingsStore.setValue("theme", null, SettingLevel.DEVICE, newTheme).catch(() => {
                    dis.dispatch<RecheckThemePayload>({ action: Action.RecheckTheme });
                    onChange(oldTheme);
                });

                onChange(newTheme);
                // The settings watcher doesn't fire until the echo comes back from the
                // server, so to make the theme change immediately we need to manually
                // do the dispatch now
                // XXX: The local echoed value appears to be unreliable, in particular
                // when settings custom themes(!) so adding forceTheme to override
                // the value from settings.
                dis.dispatch<RecheckThemePayload>({ action: Action.RecheckTheme, forceTheme: newTheme });
            }}
        >
            {themes.map((_theme) => {
                return (
                    <InlineField
                        className={classNames("mx_ThemeChoicePanel_themeSelector", {
                            [`mx_ThemeChoicePanel_themeSelector_enabled`]: !disabled && theme === _theme.id,
                            [`mx_ThemeChoicePanel_themeSelector_disabled`]: disabled,
                            // We need to force the compound theme to be light or dark
                            // The theme selection doesn't depend on the current theme
                            // For example when the light theme is used, the dark theme selector should be dark
                            "cpd-theme-light": !_theme.isDark,
                            "cpd-theme-dark": _theme.isDark,
                        })}
                        name="themeSelector"
                        key={`${_theme.id}_${disabled}`}
                        control={
                            <RadioControl
                                name="themeSelector"
                                defaultChecked={!disabled && theme === _theme.id}
                                disabled={disabled}
                                value={_theme.id}
                            />
                        }
                    >
                        <Label className="mx_ThemeChoicePanel_themeSelector_Label">{_theme.name}</Label>
                    </InlineField>
                );
            })}
        </Root>
    );
}

/**
 * Return all the available themes
 */
function useThemes(): Array<ITheme & { isDark: boolean }> {
    const customThemes = useSettingValue<CustomThemeType[] | undefined>("custom_themes");
    return useMemo(() => {
        const themes = getOrderedThemes();
        // Put the custom theme into a map
        // To easily find the theme by name when going through the themes list
        const customThemeMap = customThemes?.reduce(
            (map, theme) => map.set(theme.name, theme),
            new Map<string, CustomThemeType>(),
        );

        // Separate the built-in themes from the custom themes
        // To insert the high contrast theme between them
        const builtInThemes = themes.filter((theme) => !customThemeMap?.has(theme.name));
        const otherThemes = themes.filter((theme) => customThemeMap?.has(theme.name));

        const highContrastTheme = makeHighContrastTheme();
        if (highContrastTheme) builtInThemes.push(highContrastTheme);

        const allThemes = builtInThemes.concat(otherThemes);

        // Check if the themes are dark
        return allThemes.map((theme) => {
            const customTheme = customThemeMap?.get(theme.name);
            const isDark = (customTheme ? customTheme.is_dark : theme.id.includes("dark")) || false;
            return { ...theme, isDark };
        });
    }, [customThemes]);
}

/**
 * Create the light high contrast theme
 */
function makeHighContrastTheme(): ITheme | undefined {
    const lightHighContrastId = findHighContrastTheme("light");
    if (lightHighContrastId) {
        return {
            name: _t("settings|appearance|high_contrast"),
            id: lightHighContrastId,
        };
    }
}

/**
 * Add and manager custom themes
 */
function CustomTheme(): JSX.Element {
    const [customTheme, setCustomTheme] = useState<string>("");
    const [error, setError] = useState<string>();

    return (
        <>
            <Text className="mx_ThemeChoicePanel_CustomTheme_header" as="h4" size="lg" weight="semibold">
                {_t("settings|appearance|custom_themes")}
            </Text>
            <div className="mx_ThemeChoicePanel_CustomTheme_container">
                <EditInPlace
                    className="mx_ThemeChoicePanel_CustomTheme_EditInPlace"
                    label={_t("settings|appearance|custom_theme_add")}
                    saveButtonLabel={_t("settings|appearance|custom_theme_add")}
                    // TODO
                    savingLabel={_t("settings|appearance|custom_theme_downloading")}
                    helpLabel={_t("settings|appearance|custom_theme_help")}
                    error={error}
                    value={customTheme}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setError(undefined);
                        setCustomTheme(e.target.value);
                    }}
                    onSave={async () => {
                        // The field empty is empty
                        if (!customTheme) return;

                        // Get the custom themes and do a cheap clone
                        // To avoid to mutate the original array in the settings
                        const currentThemes =
                            SettingsStore.getValue<CustomThemeType[]>("custom_themes").map((t) => t) || [];

                        try {
                            const r = await fetch(customTheme);
                            // XXX: need some schema for this
                            const themeInfo = await r.json();
                            if (
                                !themeInfo ||
                                typeof themeInfo["name"] !== "string" ||
                                typeof themeInfo["colors"] !== "object"
                            ) {
                                setError(_t("settings|appearance|custom_theme_invalid"));
                                return;
                            }
                            currentThemes.push(themeInfo);
                        } catch (e) {
                            logger.error(e);
                            setError(_t("settings|appearance|custom_theme_error_downloading"));
                            return;
                        }

                        // Reset the error
                        setError(undefined);
                        setCustomTheme("");
                        await SettingsStore.setValue("custom_themes", null, SettingLevel.ACCOUNT, currentThemes);
                    }}
                    onCancel={() => {
                        setError(undefined);
                        setCustomTheme("");
                    }}
                />
                <CustomThemeList />
            </div>
        </>
    );
}

/**
 * List of the custom themes
 * @constructor
 */
function CustomThemeList(): JSX.Element {
    const customThemes = useSettingValue<CustomThemeType[]>("custom_themes") || [];

    return (
        <>
            {customThemes.map((theme) => {
                return (
                    <div key={theme.name} className="mx_ThemeChoicePanel_CustomThemeList">
                        <span className="mx_ThemeChoicePanel_CustomThemeList_name">{theme.name}</span>
                        <IconButton
                            onClick={async () => {
                                // Get the custom themes and do a cheap clone
                                // To avoid to mutate the original array in the settings
                                const currentThemes =
                                    SettingsStore.getValue<CustomThemeType[]>("custom_themes").map((t) => t) || [];

                                // Remove the theme from the list
                                const newThemes = currentThemes.filter((t) => t.name !== theme.name);
                                await SettingsStore.setValue("custom_themes", null, SettingLevel.ACCOUNT, newThemes);
                            }}
                        >
                            <DeleteIcon className="mx_ThemeChoicePanel_CustomThemeList_delete" />
                        </IconButton>
                    </div>
                );
            })}
        </>
    );
}
