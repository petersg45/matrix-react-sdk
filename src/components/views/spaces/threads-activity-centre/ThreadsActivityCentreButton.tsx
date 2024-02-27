/*
 *
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
 * /
 */

import React, { forwardRef, HTMLProps } from "react";
import { Icon } from "@vector-im/compound-design-tokens/icons/threads-solid.svg";
import classNames from "classnames";
import { IconButton, Text, Tooltip } from "@vector-im/compound-web";

import { _t } from "../../../../languageHandler";
import { NotificationLevel } from "../../../../stores/notifications/NotificationLevel";
import { notificationLevelToIndicator } from "../../../../utils/notifications";

interface ThreadsActivityCentreButtonProps extends HTMLProps<HTMLDivElement> {
    /**
     * Display the `Treads` label next to the icon.
     */
    displayLabel?: boolean;
    /**
     * The notification level of the threads.
     */
    notificationLevel: NotificationLevel;
    /**
     * Whether to disable the tooltip.
     */
    disableTooltip?: boolean;
}

/**
 * A button to open the thread activity centre.
 */
export const ThreadsActivityCentreButton = forwardRef<HTMLDivElement, ThreadsActivityCentreButtonProps>(
    function ThreadsActivityCentreButton(
        { displayLabel, notificationLevel, disableTooltip = false, ...props },
        ref,
    ): React.JSX.Element {
        const openTooltip = displayLabel || disableTooltip ? false : undefined;

        return (
            <Tooltip label={_t("common|threads")} side="right" open={openTooltip}>
                <IconButton
                    className={classNames("mx_ThreadsActivityCentreButton", { expanded: displayLabel })}
                    indicator={notificationLevelToIndicator(notificationLevel)}
                    // @ts-ignore
                    // ref nightmare...
                    ref={ref}
                    {...props}
                >
                    <>
                        <Icon className="mx_ThreadsActivityCentreButton_Icon" />
                        {displayLabel && (
                            <Text
                                className="mx_ThreadsActivityCentreButton_Text"
                                as="span"
                                size="md"
                                title={_t("common|threads")}
                            >
                                {_t("common|threads")}
                            </Text>
                        )}
                    </>
                </IconButton>
            </Tooltip>
        );
    },
);
