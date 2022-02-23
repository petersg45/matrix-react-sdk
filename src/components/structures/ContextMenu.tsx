/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2018 New Vector Ltd
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

import React, { CSSProperties, RefObject, SyntheticEvent, useRef, useState } from "react";
import ReactDOM from "react-dom";
import classNames from "classnames";
import FocusLock from "react-focus-lock";

import { Key } from "../../Keyboard";
import { Writeable } from "../../@types/common";
import { replaceableComponent } from "../../utils/replaceableComponent";
import UIStore from "../../stores/UIStore";
import { checkInputableElement, RovingTabIndexProvider } from "../../accessibility/RovingTabIndex";

// Shamelessly ripped off Modal.js.  There's probably a better way
// of doing reusable widgets like dialog boxes & menus where we go and
// pass in a custom control as the actual body.

const WINDOW_PADDING = 10;
const ContextualMenuContainerId = "mx_ContextualMenu_Container";

function getOrCreateContainer(): HTMLDivElement {
    let container = document.getElementById(ContextualMenuContainerId) as HTMLDivElement;

    if (!container) {
        container = document.createElement("div");
        container.id = ContextualMenuContainerId;
        document.body.appendChild(container);
    }

    return container;
}

export interface IPosition {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    rightAligned?: boolean;
    bottomAligned?: boolean;
}

export enum ChevronFace {
    Top = "top",
    Bottom = "bottom",
    Left = "left",
    Right = "right",
    None = "none",
}

export interface IProps extends IPosition {
    menuWidth?: number;
    menuHeight?: number;

    chevronOffset?: number;
    chevronFace?: ChevronFace;

    menuPaddingTop?: number;
    menuPaddingBottom?: number;
    menuPaddingLeft?: number;
    menuPaddingRight?: number;

    zIndex?: number;

    // If true, insert an invisible screen-sized element behind the menu that when clicked will close it.
    hasBackground?: boolean;
    // whether this context menu should be focus managed. If false it must handle itself
    managed?: boolean;
    wrapperClassName?: string;

    // If true, this context menu will be mounted as a child to the parent container. Otherwise
    // it will be mounted to a container at the root of the DOM.
    mountAsChild?: boolean;

    // If specified, contents will be wrapped in a FocusLock, this is only needed if the context menu is being rendered
    // within an existing FocusLock e.g inside a modal.
    focusLock?: boolean;

    // Function to be called on menu close
    onFinished();
    // on resize callback
    windowResize?();
}

interface IState {
    contextMenuElem: HTMLDivElement;
}

// Generic ContextMenu Portal wrapper
// all options inside the menu should be of role=menuitem/menuitemcheckbox/menuitemradiobutton and have tabIndex={-1}
// this will allow the ContextMenu to manage its own focus using arrow keys as per the ARIA guidelines.
@replaceableComponent("structures.ContextMenu")
export default class ContextMenu extends React.PureComponent<IProps, IState> {
    private readonly initialFocus: HTMLElement;

    static defaultProps = {
        hasBackground: true,
        managed: true,
    };

    constructor(props, context) {
        super(props, context);

        this.state = {
            contextMenuElem: null,
        };

        // persist what had focus when we got initialized so we can return it after
        this.initialFocus = document.activeElement as HTMLElement;
    }

    componentWillUnmount() {
        // return focus to the thing which had it before us
        this.initialFocus.focus();
    }

    private collectContextMenuRect = (element: HTMLDivElement) => {
        // We don't need to clean up when unmounting, so ignore
        if (!element) return;

        const first = element.querySelector<HTMLElement>('[role^="menuitem"]')
            || element.querySelector<HTMLElement>('[tab-index]');

        if (first) {
            first.focus();
        }

        this.setState({
            contextMenuElem: element,
        });
    };

    private onContextMenu = (e) => {
        if (this.props.onFinished) {
            this.props.onFinished();

            e.preventDefault();
            e.stopPropagation();
            const x = e.clientX;
            const y = e.clientY;

            // XXX: This isn't pretty but the only way to allow opening a different context menu on right click whilst
            // a context menu and its click-guard are up without completely rewriting how the context menus work.
            setImmediate(() => {
                const clickEvent = document.createEvent('MouseEvents');
                clickEvent.initMouseEvent(
                    'contextmenu', true, true, window, 0,
                    0, 0, x, y, false, false,
                    false, false, 0, null,
                );
                document.elementFromPoint(x, y).dispatchEvent(clickEvent);
            });
        }
    };

    private onContextMenuPreventBubbling = (e) => {
        // stop propagation so that any context menu handlers don't leak out of this context menu
        // but do not inhibit the default browser menu
        e.stopPropagation();
    };

    // Prevent clicks on the background from going through to the component which opened the menu.
    private onFinished = (ev: React.MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (this.props.onFinished) this.props.onFinished();
    };

    private onClick = (ev: React.MouseEvent) => {
        // Don't allow clicks to escape the context menu wrapper
        ev.stopPropagation();
    };

    // We now only handle closing the ContextMenu in this keyDown handler.
    // All of the item/option navigation is delegated to RovingTabIndex.
    private onKeyDown = (ev: React.KeyboardEvent) => {
        ev.stopPropagation(); // prevent keyboard propagating out of the context menu, we're focus-locked

        // If someone is managing their own focus, we will only exit for them with Escape.
        // They are probably using props.focusLock along with this option as well.
        if (!this.props.managed) {
            if (ev.key === Key.ESCAPE) {
                this.props.onFinished();
            }
            return;
        }

        // When an <input> is focused, only handle the Escape key
        if (checkInputableElement(ev.target as HTMLElement) && ev.key !== Key.ESCAPE) {
            return;
        }

        if (
            ev.key === Key.ESCAPE ||
            // You can only navigate the ContextMenu by arrow keys and Home/End (see RovingTabIndex).
            // Tabbing to the next section of the page, will close the ContextMenu.
            ev.key === Key.TAB ||
            // When someone moves left or right along a <Toolbar /> (like the
            // MessageActionBar), we should close any ContextMenu that is open.
            ev.key === Key.ARROW_LEFT ||
            ev.key === Key.ARROW_RIGHT
        ) {
            this.props.onFinished();
        }
    };

    protected renderMenu(hasBackground = this.props.hasBackground) {
        const position: Partial<Writeable<DOMRect>> = {};
        const props = this.props;

        if (props.top) {
            position.top = props.top;
        } else {
            position.bottom = props.bottom;
        }

        let chevronFace: ChevronFace;
        if (props.left) {
            position.left = props.left;
            chevronFace = ChevronFace.Left;
        } else {
            position.right = props.right;
            chevronFace = ChevronFace.Right;
        }

        const contextMenuRect = this.state.contextMenuElem ? this.state.contextMenuElem.getBoundingClientRect() : null;

        const chevronOffset: CSSProperties = {};
        if (props.chevronFace) {
            chevronFace = props.chevronFace;
        }
        const hasChevron = chevronFace && chevronFace !== ChevronFace.None;

        if (chevronFace === ChevronFace.Top || chevronFace === ChevronFace.Bottom) {
            chevronOffset.left = props.chevronOffset;
        } else {
            chevronOffset.top = props.chevronOffset;
        }

        // If we know the dimensions of the context menu, adjust its position to
        // keep it within the bounds of the (padded) window
        const { windowWidth, windowHeight } = UIStore.instance;
        if (contextMenuRect) {
            if (position.top !== undefined) {
                position.top = Math.min(
                    position.top,
                    windowHeight - contextMenuRect.height - WINDOW_PADDING,
                );
                // Adjust the chevron if necessary
                if (chevronOffset.top !== undefined) {
                    chevronOffset.top = props.chevronOffset + props.top - position.top;
                }
            } else if (position.bottom !== undefined) {
                position.bottom = Math.min(
                    position.bottom,
                    windowHeight - contextMenuRect.height - WINDOW_PADDING,
                );
                if (chevronOffset.top !== undefined) {
                    chevronOffset.top = props.chevronOffset + props.bottom - position.bottom;
                }
            }
            if (position.left !== undefined) {
                position.left = Math.min(
                    position.left,
                    windowWidth - contextMenuRect.width - WINDOW_PADDING,
                );
                if (chevronOffset.left !== undefined) {
                    chevronOffset.left = props.chevronOffset + props.left - position.left;
                }
            } else if (position.right !== undefined) {
                position.right = Math.min(
                    position.right,
                    windowWidth - contextMenuRect.width - WINDOW_PADDING,
                );
                if (chevronOffset.left !== undefined) {
                    chevronOffset.left = props.chevronOffset + props.right - position.right;
                }
            }
        }

        let chevron;
        if (hasChevron) {
            chevron = <div style={chevronOffset} className={"mx_ContextualMenu_chevron_" + chevronFace} />;
        }

        const menuClasses = classNames({
            'mx_ContextualMenu': true,
            /**
             * In some cases we may get the number of 0, which still means that we're supposed to properly
             * add the specific position class, but as it was falsy things didn't work as intended.
             * In addition, defensively check for counter cases where we may get more than one value,
             * even if we shouldn't.
             */
            'mx_ContextualMenu_left': !hasChevron && position.left !== undefined && !position.right,
            'mx_ContextualMenu_right': !hasChevron && position.right !== undefined && !position.left,
            'mx_ContextualMenu_top': !hasChevron && position.top !== undefined && !position.bottom,
            'mx_ContextualMenu_bottom': !hasChevron && position.bottom !== undefined && !position.top,
            'mx_ContextualMenu_withChevron_left': chevronFace === ChevronFace.Left,
            'mx_ContextualMenu_withChevron_right': chevronFace === ChevronFace.Right,
            'mx_ContextualMenu_withChevron_top': chevronFace === ChevronFace.Top,
            'mx_ContextualMenu_withChevron_bottom': chevronFace === ChevronFace.Bottom,
            'mx_ContextualMenu_rightAligned': this.props.rightAligned === true,
            'mx_ContextualMenu_bottomAligned': this.props.bottomAligned === true,
        });

        const menuStyle: CSSProperties = {};
        if (props.menuWidth) {
            menuStyle.width = props.menuWidth;
        }

        if (props.menuHeight) {
            menuStyle.height = props.menuHeight;
        }

        if (!isNaN(Number(props.menuPaddingTop))) {
            menuStyle["paddingTop"] = props.menuPaddingTop;
        }
        if (!isNaN(Number(props.menuPaddingLeft))) {
            menuStyle["paddingLeft"] = props.menuPaddingLeft;
        }
        if (!isNaN(Number(props.menuPaddingBottom))) {
            menuStyle["paddingBottom"] = props.menuPaddingBottom;
        }
        if (!isNaN(Number(props.menuPaddingRight))) {
            menuStyle["paddingRight"] = props.menuPaddingRight;
        }

        const wrapperStyle = {};
        if (!isNaN(Number(props.zIndex))) {
            menuStyle["zIndex"] = props.zIndex + 1;
            wrapperStyle["zIndex"] = props.zIndex;
        }

        let background;
        if (hasBackground) {
            background = (
                <div
                    className="mx_ContextualMenu_background"
                    style={wrapperStyle}
                    onClick={this.onFinished}
                    onContextMenu={this.onContextMenu}
                />
            );
        }

        let body = <>
            { chevron }
            { props.children }
        </>;

        if (props.focusLock) {
            body = <FocusLock>
                { body }
            </FocusLock>;
        }

        return (
            <RovingTabIndexProvider handleHomeEnd handleUpDown onKeyDown={this.onKeyDown}>
                { ({ onKeyDownHandler }) => (
                    <div
                        className={classNames("mx_ContextualMenu_wrapper", this.props.wrapperClassName)}
                        style={{ ...position, ...wrapperStyle }}
                        onClick={this.onClick}
                        onKeyDown={onKeyDownHandler}
                        onContextMenu={this.onContextMenuPreventBubbling}
                    >
                        { background }
                        <div
                            className={menuClasses}
                            style={menuStyle}
                            ref={this.collectContextMenuRect}
                            role={this.props.managed ? "menu" : undefined}
                        >
                            { body }
                        </div>
                    </div>
                ) }
            </RovingTabIndexProvider>
        );
    }

    render(): React.ReactChild {
        if (this.props.mountAsChild) {
            // Render as a child of the current parent
            return this.renderMenu();
        } else {
            // Render as a child of a container at the root of the DOM
            return ReactDOM.createPortal(this.renderMenu(), getOrCreateContainer());
        }
    }
}

export type ToRightOf = {
    left: number;
    top: number;
    chevronOffset: number;
};

// Placement method for <ContextMenu /> to position context menu to right of elementRect with chevronOffset
export const toRightOf = (elementRect: Pick<DOMRect, "right" | "top" | "height">, chevronOffset = 12): ToRightOf => {
    const left = elementRect.right + window.pageXOffset + 3;
    let top = elementRect.top + (elementRect.height / 2) + window.pageYOffset;
    top -= chevronOffset + 8; // where 8 is half the height of the chevron
    return { left, top, chevronOffset };
};

export type AboveLeftOf = IPosition & {
    chevronFace: ChevronFace;
};

// Placement method for <ContextMenu /> to position context menu right-aligned and flowing to the left of elementRect,
// and either above or below: wherever there is more space (maybe this should be aboveOrBelowLeftOf?)
export const aboveLeftOf = (
    elementRect: DOMRect,
    chevronFace = ChevronFace.None,
    vPadding = 0,
): AboveLeftOf => {
    const menuOptions: IPosition & { chevronFace: ChevronFace } = { chevronFace };

    const buttonRight = elementRect.right + window.pageXOffset;
    const buttonBottom = elementRect.bottom + window.pageYOffset;
    const buttonTop = elementRect.top + window.pageYOffset;
    // Align the right edge of the menu to the right edge of the button
    menuOptions.right = UIStore.instance.windowWidth - buttonRight;
    // Align the menu vertically on whichever side of the button has more space available.
    if (buttonBottom < UIStore.instance.windowHeight / 2) {
        menuOptions.top = buttonBottom + vPadding;
    } else {
        menuOptions.bottom = (UIStore.instance.windowHeight - buttonTop) + vPadding;
    }

    return menuOptions;
};

// Placement method for <ContextMenu /> to position context menu right-aligned and flowing to the left of elementRect
// and always above elementRect
export const alwaysAboveLeftOf = (elementRect: DOMRect, chevronFace = ChevronFace.None, vPadding = 0) => {
    const menuOptions: IPosition & { chevronFace: ChevronFace } = { chevronFace };

    const buttonRight = elementRect.right + window.pageXOffset;
    const buttonBottom = elementRect.bottom + window.pageYOffset;
    const buttonTop = elementRect.top + window.pageYOffset;
    // Align the right edge of the menu to the right edge of the button
    menuOptions.right = UIStore.instance.windowWidth - buttonRight;
    // Align the menu vertically on whichever side of the button has more space available.
    if (buttonBottom < UIStore.instance.windowHeight / 2) {
        menuOptions.top = buttonBottom + vPadding;
    } else {
        menuOptions.bottom = (UIStore.instance.windowHeight - buttonTop) + vPadding;
    }

    return menuOptions;
};

// Placement method for <ContextMenu /> to position context menu right-aligned and flowing to the right of elementRect
// and always above elementRect
export const alwaysAboveRightOf = (elementRect: DOMRect, chevronFace = ChevronFace.None, vPadding = 0) => {
    const menuOptions: IPosition & { chevronFace: ChevronFace } = { chevronFace };

    const buttonLeft = elementRect.left + window.pageXOffset;
    const buttonTop = elementRect.top + window.pageYOffset;
    // Align the left edge of the menu to the left edge of the button
    menuOptions.left = buttonLeft;
    // Align the menu vertically above the menu
    menuOptions.bottom = (UIStore.instance.windowHeight - buttonTop) + vPadding;

    return menuOptions;
};

type ContextMenuTuple<T> = [
    boolean,
    RefObject<T>,
    (ev?: SyntheticEvent) => void,
    (ev?: SyntheticEvent) => void,
    (val: boolean) => void,
];
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const useContextMenu = <T extends any = HTMLElement>(): ContextMenuTuple<T> => {
    const button = useRef<T>(null);
    const [isOpen, setIsOpen] = useState(false);
    const open = (ev?: SyntheticEvent) => {
        ev?.preventDefault();
        ev?.stopPropagation();
        setIsOpen(true);
    };
    const close = (ev?: SyntheticEvent) => {
        ev?.preventDefault();
        ev?.stopPropagation();
        setIsOpen(false);
    };

    return [isOpen, button, open, close, setIsOpen];
};

// XXX: Deprecated, used only for dynamic Tooltips. Avoid using at all costs.
export function createMenu(ElementClass, props) {
    const onFinished = function(...args) {
        ReactDOM.unmountComponentAtNode(getOrCreateContainer());
        props?.onFinished?.apply(null, args);
    };

    const menu = <ContextMenu
        {...props}
        mountAsChild={true}
        hasBackground={false}
        onFinished={onFinished} // eslint-disable-line react/jsx-no-bind
        windowResize={onFinished} // eslint-disable-line react/jsx-no-bind
    >
        <ElementClass {...props} onFinished={onFinished} />
    </ContextMenu>;

    ReactDOM.render(menu, getOrCreateContainer());

    return { close: onFinished };
}

// re-export the semantic helper components for simplicity
export { ContextMenuButton } from "../../accessibility/context_menu/ContextMenuButton";
export { ContextMenuTooltipButton } from "../../accessibility/context_menu/ContextMenuTooltipButton";
export { MenuGroup } from "../../accessibility/context_menu/MenuGroup";
export { MenuItem } from "../../accessibility/context_menu/MenuItem";
export { MenuItemCheckbox } from "../../accessibility/context_menu/MenuItemCheckbox";
export { MenuItemRadio } from "../../accessibility/context_menu/MenuItemRadio";
export { StyledMenuItemCheckbox } from "../../accessibility/context_menu/StyledMenuItemCheckbox";
export { StyledMenuItemRadio } from "../../accessibility/context_menu/StyledMenuItemRadio";
