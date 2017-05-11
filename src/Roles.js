/*
Copyright 2017 Vector Creations Ltd

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
import _t from 'counterpart';
export const LEVEL_ROLE_MAP = {
    undefined: _t('Default'),
    0: _t('User'),
    50: _t('Moderator'),
    100: _t('Admin'),
};

export function textualPowerLevel(level, userDefault) {
    if (LEVEL_ROLE_MAP[level]) {
        return LEVEL_ROLE_MAP[level] + (level !== undefined ? ` (${level})` : ` (${userDefault})`);
    } else {
        return level;
    }
}
