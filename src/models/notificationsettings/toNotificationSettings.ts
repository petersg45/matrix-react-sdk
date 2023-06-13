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

import { IPushRule, IPushRules, RuleId } from "matrix-js-sdk/src/matrix";

import { NotificationUtils } from "../../notifications";
import { RoomNotifState } from "../../RoomNotifs";
import { NotificationSettings } from "./NotificationSettings";
import { buildPushRuleMap } from "./PushRuleMap";

function shouldNotify(rules: (IPushRule | null | undefined | false)[]): boolean {
    for (const rule of rules) {
        if (rule === null || rule === undefined || rule === false || !rule.enabled) {
            continue;
        }
        const actions = NotificationUtils.decodeActions(rule.actions);
        if (actions.notify) {
            return true;
        }
    }
    return false;
}

function determineSound(rules: (IPushRule | null | undefined | false)[]): string | null {
    for (const rule of rules) {
        if (rule === null || rule === undefined || rule === false || !rule.enabled) {
            continue;
        }
        const actions = NotificationUtils.decodeActions(rule.actions);
        if (actions.notify && actions.sound !== undefined) {
            return actions.sound;
        }
    }
    return undefined;
}

export function toNotificationSettings(
    pushRules: IPushRules,
    supportsIntentionalMentions: boolean,
): NotificationSettings {
    const standardRules = buildPushRuleMap(pushRules);
    const contentRules = pushRules.global.content?.filter((rule) => !rule.rule_id.startsWith(".")) ?? [];
    const dmRules = [standardRules.get(RuleId.DM), standardRules.get(RuleId.EncryptedDM)];
    const roomRules = [standardRules.get(RuleId.Message), standardRules.get(RuleId.EncryptedMessage)];
    return {
        globalMute: standardRules.get(RuleId.Master)?.enabled ?? false,
        defaultLevels: {
            room: shouldNotify(roomRules) ? RoomNotifState.AllMessages : RoomNotifState.MentionsOnly,
            dm: shouldNotify(dmRules) ? RoomNotifState.AllMessages : RoomNotifState.MentionsOnly,
        },
        sound: {
            calls: determineSound([standardRules.get(RuleId.IncomingCall)]),
            mentions: determineSound([
                supportsIntentionalMentions && standardRules.get(RuleId.IsUserMention),
                standardRules.get(RuleId.ContainsUserName),
                standardRules.get(RuleId.ContainsDisplayName),
            ]),
            people: determineSound(dmRules),
        },
        activity: {
            bot_notices: shouldNotify([standardRules.get(RuleId.SuppressNotices)]),
            invite: shouldNotify([standardRules.get(RuleId.InviteToSelf)]),
            status_event: shouldNotify([standardRules.get(RuleId.MemberEvent), standardRules.get(RuleId.Tombstone)]),
        },
        mentions: {
            user: shouldNotify([
                supportsIntentionalMentions && standardRules.get(RuleId.IsUserMention),
                standardRules.get(RuleId.ContainsUserName),
                standardRules.get(RuleId.ContainsDisplayName),
            ]),
            room: shouldNotify([
                supportsIntentionalMentions && standardRules.get(RuleId.IsRoomMention),
                standardRules.get(RuleId.AtRoomNotification),
            ]),
            keywords: shouldNotify(contentRules),
        },
        keywords: contentRules.map((it) => it.pattern),
    };
}
