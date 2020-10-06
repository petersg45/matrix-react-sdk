/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

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
import PropTypes from "prop-types";
import {_t} from "../../../languageHandler";
import SettingsStore from "../../../settings/SettingsStore";

interface IProps {
    /** The width of the spinner. */
    w?: number;

    /** The height of the spinner. */
    h?: number;

    imgClassName?: string;
    message?: React.ReactNode;
}

const Spinner = ({w = 32, h = 32, imgClassName, message}: IProps) => {
    const imageSource = SettingsStore.getValue('feature_new_spinner')
        ? require("../../../../res/img/spinner.svg")
        : require("../../../../res/img/spinner.gif");

    return (
        <div className="mx_Spinner">
            { message && <><div className="mx_Spinner_Msg">{ message }</div>&nbsp;</> }
            <img
                src={imageSource}
                width={w}
                height={h}
                className={imgClassName}
                aria-label={_t("Loading...")}
            />
        </div>
    );
};
Spinner.propTypes = {
    w: PropTypes.number,
    h: PropTypes.number,
    imgClassName: PropTypes.string,
    message: PropTypes.node,
};

export default Spinner;
