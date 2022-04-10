/*
Copyright 2021 The Matrix.org Foundation C.I.C.

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

import React from 'react';
import { mount } from 'enzyme';
import { act } from "react-dom/test-utils";

import StyledRadioGroup from "../../../../src/components/views/elements/StyledRadioGroup";

describe('<StyledRadioGroup />', () => {
    const optionA = {
        value: 'Anteater',
        label: <span>Anteater label</span>,
        description: 'anteater description',
        className: 'a-class',
    };
    const optionB = {
        value: 'Badger',
        label: <span>Badger label</span>,
    };
    const optionC = {
        value: 'Canary',
        label: <span>Canary label</span>,
        description: <span>Canary description</span>,
    };
    const defaultDefinitions = [optionA, optionB, optionC];
    const defaultProps = {
        name: 'test',
        className: 'test-class',
        definitions: defaultDefinitions,
        onChange: jest.fn(),
    };
    const getComponent = (props = {}) => mount(<StyledRadioGroup {...defaultProps} {...props} />);

    const getInputByValue = (component, value) => component.find(`input[value="${value}"]`);
    const getCheckedInput = component => component.find('input[checked=true]');

    it('renders radios correctly when no value is provided', () => {
        const component = getComponent();

        expect(component).toMatchSnapshot();
        expect(getCheckedInput(component).length).toBeFalsy();
    });

    it('selects correct button when value is provided', () => {
        const component = getComponent({
            value: optionC.value,
        });

        expect(getCheckedInput(component).at(0).props().value).toEqual(optionC.value);
    });

    it('selects correct buttons when definitions have checked prop', () => {
        const definitions = [
            { ...optionA, checked: true },
            optionB,
            { ...optionC, checked: false },
        ];
        const component = getComponent({
            value: optionC.value, definitions,
        });

        expect(getInputByValue(component, optionA.value).props().checked).toBeTruthy();
        expect(getInputByValue(component, optionB.value).props().checked).toBeFalsy();
        // optionC.checked = false overrides value matching
        expect(getInputByValue(component, optionC.value).props().checked).toBeFalsy();
    });

    it('disables individual buttons based on definition.disabled', () => {
        const definitions = [
            optionA,
            { ...optionB, disabled: true },
            { ...optionC, disabled: true },
        ];
        const component = getComponent({ definitions });
        expect(getInputByValue(component, optionA.value).props().disabled).toBeFalsy();
        expect(getInputByValue(component, optionB.value).props().disabled).toBeTruthy();
        expect(getInputByValue(component, optionC.value).props().disabled).toBeTruthy();
    });

    it('disables all buttons with disabled prop', () => {
        const component = getComponent({ disabled: true });
        expect(getInputByValue(component, optionA.value).props().disabled).toBeTruthy();
        expect(getInputByValue(component, optionB.value).props().disabled).toBeTruthy();
        expect(getInputByValue(component, optionC.value).props().disabled).toBeTruthy();
    });

    it('calls onChange on click', () => {
        const onChange = jest.fn();
        const component = getComponent({
            value: optionC.value,
            onChange,
        });

        act(() => {
            getInputByValue(component, optionB.value).simulate('change');
        });

        expect(onChange).toHaveBeenCalledWith(optionB.value);
    });
});
