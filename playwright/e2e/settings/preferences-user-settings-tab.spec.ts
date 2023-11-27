/*
Copyright 2023 Suguru Hirahara

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

import { test, expect } from "../../element-web-test";

test.describe("Preferences user settings tab", () => {
    test.use({
        displayName: "Bob",
    });

    test("should be rendered properly", async ({ app, user }) => {
        const tab = await app.openUserSettings("Preferences");

        // Assert that the top heading is rendered
        await expect(tab.getByRole("heading", { name: "Preferences" })).toBeVisible();
        await expect(tab).toHaveScreenshot();
    });
});
