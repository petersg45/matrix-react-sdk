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

import React from "react";
import { render, screen } from "@testing-library/react";

import Field from "../../../../src/components/views/elements/Field";

describe("Field", () => {
    describe("Placeholder", () => {
        it("Should display a placeholder", async () => {
            // When
            const { rerender } = render(<Field value="" placeholder="my placeholder" />);

            // Then
            expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "my placeholder");

            // When
            rerender(<Field value="" placeholder="" />);

            // Then
            expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "");
        });

        it("Should display label as placeholder", async () => {
            // When
            render(<Field value="" label="my label" />);

            // Then
            expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", "my label");
        });

        it("Should not display a placeholder", async () => {
            // When
            render(<Field value="" />);

            // Then
            expect(screen.getByRole("textbox")).not.toHaveAttribute("placeholder", "my placeholder");
        });
    });
});
