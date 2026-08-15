import DailyNoteViewPlugin from "./dailyNoteViewIndex";
import {
    AbstractInputSuggest,
    App,
    debounce,
    Modal,
    PluginSettingTab,
    Setting,
    TFile,
} from "obsidian";

export interface DailyNoteSettings {
    hideFrontmatter: boolean;
    hideBacklinks: boolean;
    createAndOpenOnStartup: boolean;
    useArrowUpOrDownToNavigate: boolean;

    embedNoteEnabled: boolean;
    embedNotePath: string;

    preset: {
        type: "folder" | "tag";
        target: string;
    }[];
}

export const DEFAULT_SETTINGS: DailyNoteSettings = {
    hideFrontmatter: false,
    hideBacklinks: false,
    createAndOpenOnStartup: false,
    useArrowUpOrDownToNavigate: false,
    embedNoteEnabled: false,
    embedNotePath: "",
    preset: [],
};

export class DailyNoteSettingTab extends PluginSettingTab {
    plugin: DailyNoteViewPlugin;

    constructor(app: App, plugin: DailyNoteViewPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    debounceApplySettingsUpdate = debounce(
        async () => {
            await this.plugin.saveSettings();
        },
        200,
        true
    );

    debounceDisplay = debounce(
        async () => {
            await this.display();
        },
        400,
        true
    );

    applySettingsUpdate() {
        this.debounceApplySettingsUpdate();
    }

    async display() {
        await this.plugin.loadSettings();

        const { containerEl } = this;
        const settings = this.plugin.settings;

        containerEl.toggleClass("daily-note-settings-container", true);

        containerEl.empty();

        new Setting(containerEl)
            .setName("Hide frontmatter")
            .setDesc("Hide frontmatter in daily notes")
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.hideFrontmatter)
                    .onChange(async (value) => {
                        this.plugin.settings.hideFrontmatter = value;

                        document.body.classList.toggle(
                            "daily-notes-hide-frontmatter",
                            value
                        );
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Hide backlinks")
            .setDesc("Hide backlinks in daily notes")
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.hideBacklinks)
                    .onChange(async (value) => {
                        this.plugin.settings.hideBacklinks = value;

                        document.body.classList.toggle(
                            "daily-notes-hide-backlinks",
                            value
                        );
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Create and open Daily Notes Editor on startup")
            .setDesc(
                "Automatically create today's daily note and open the Daily Notes Editor when Obsidian starts"
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.createAndOpenOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.createAndOpenOnStartup = value;
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Use arrow up/down key to navigate between notes")
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.useArrowUpOrDownToNavigate)
                    .onChange(async (value) => {
                        this.plugin.settings.useArrowUpOrDownToNavigate = value;
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Embed a note right after the latest daily note")
            .setDesc(
                "Embed the content of a configured note right after the latest daily note."
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(settings.embedNoteEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.embedNoteEnabled = value;
                        this.applySettingsUpdate();
                    })
            );

        new Setting(containerEl)
            .setName("Note to embed")
            .setDesc(
                "Path or name of the note to Embed."
            )
            .addText((text) => {
                text
                    .setPlaceholder("Enter note path or name")
                    .setValue(settings.embedNotePath);

                new NoteInputSuggest(this.app, text.inputEl, (file) => {
                    this.plugin.settings.embedNotePath = file.path;
                    this.applySettingsUpdate();
                });

                text.onChange(async (value) => {
                    this.plugin.settings.embedNotePath = value.trim();
                    this.applySettingsUpdate();
                });
            });

        new Setting(containerEl).setName("Saved presets").setHeading();

        const presetContainer = containerEl.createDiv("preset-container");

        // Display existing presets
        if (settings.preset.length === 0) {
            presetContainer.createEl("p", {
                text: "No presets saved yet. Select a folder or tag in the Daily Notes Editor to create a preset.",
                cls: "no-presets-message",
            });
        } else {
            settings.preset.forEach((preset, index) => {
                new Setting(containerEl)
                    .setName(
                        preset.type === "folder"
                            ? "Focus on Folder: "
                            : "Focus on Tag: "
                    )
                    .setDesc(preset.target)
                    .addButton((button) => {
                        button.setIcon("trash");
                        button.onClick(() => {
                            settings.preset.splice(index, 1);
                            this.applySettingsUpdate();
                            this.debounceDisplay();
                        });
                    });
            });
        }

        // Add button to add a new preset
        new Setting(containerEl)
            .setName("Add new preset")
            .setDesc("Add a new folder or tag preset")
            .addButton((button) => {
                button
                    .setButtonText("Add Preset")
                    .setCta()
                    .onClick(() => {
                        const modal = new AddPresetModal(
                            this.app,
                            (type, target) => {
                                // Check if this preset already exists
                                const existingPresetIndex =
                                    settings.preset.findIndex(
                                        (p) =>
                                            p.type === type &&
                                            p.target === target
                                    );

                                // If it doesn't exist, add it
                                if (existingPresetIndex === -1) {
                                    settings.preset.push({
                                        type,
                                        target,
                                    });
                                    this.applySettingsUpdate();
                                    this.debounceDisplay();
                                }
                            }
                        );
                        modal.open();
                    });
            });
    }
}

// A type-ahead suggestion that lists vault notes matching the typed input
class NoteInputSuggest extends AbstractInputSuggest<TFile> {
    onSelectCb: (file: TFile) => void;

    constructor(
        app: App,
        inputEl: HTMLInputElement,
        onSelect: (file: TFile) => void
    ) {
        super(app, inputEl);
        this.onSelectCb = onSelect;
        this.limit = 30;
    }

    getSuggestions(query: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles().sort((a, b) =>
            a.basename.localeCompare(b.basename)
        );

        const normalized = query.trim().toLowerCase();
        if (!normalized) {
            return files.slice(0, this.limit);
        }

        return files
            .filter(
                (file) =>
                    file.basename.toLowerCase().includes(normalized) ||
                    file.path.toLowerCase().includes(normalized)
            )
            .slice(0, this.limit);
    }

    renderSuggestion(value: TFile, el: HTMLElement) {
        const content = el.createDiv("suggestion-content");
        content.createDiv("suggestion-title").setText(value.basename);
        content.createDiv({
            cls: "suggestion-note-path",
            text: value.path,
        });
    }

    selectSuggestion(value: TFile, evt: MouseEvent | KeyboardEvent) {
        this.setValue(value.path);
        this.onSelectCb(value);
        this.close();
    }
}

// Add a new modal for adding presets
class AddPresetModal extends Modal {
    saveCallback: (type: "folder" | "tag", target: string) => void;
    type: "folder" | "tag" = "folder";
    targetInput: HTMLInputElement;

    constructor(
        app: App,
        saveCallback: (type: "folder" | "tag", target: string) => void
    ) {
        super(app);
        this.saveCallback = saveCallback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl("h2", { text: "Add New Preset" });

        const form = contentEl.createEl("form");
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            this.save();
        });

        // Type selection
        const typeSetting = form.createDiv();
        typeSetting.addClass("setting-item");

        const typeSettingInfo = typeSetting.createDiv();
        typeSettingInfo.addClass("setting-item-info");
        typeSettingInfo.createEl("div", {
            text: "Preset Type",
            cls: "setting-item-name",
        });

        const typeSettingControl = typeSetting.createDiv();
        typeSettingControl.addClass("setting-item-control");

        // Radio buttons for type selection
        const folderRadio = typeSettingControl.createEl("input", {
            type: "radio",
            attr: {
                name: "preset-type",
                id: "preset-type-folder",
                value: "folder",
                checked: true,
            },
        });
        typeSettingControl.createEl("label", {
            text: "Folder",
            attr: {
                for: "preset-type-folder",
            },
        });

        const tagRadio = typeSettingControl.createEl("input", {
            type: "radio",
            attr: {
                name: "preset-type",
                id: "preset-type-tag",
                value: "tag",
            },
        });
        typeSettingControl.createEl("label", {
            text: "Tag",
            attr: {
                for: "preset-type-tag",
            },
        });

        folderRadio.addEventListener("change", () => {
            if (folderRadio.checked) {
                this.type = "folder";
            }
        });

        tagRadio.addEventListener("change", () => {
            if (tagRadio.checked) {
                this.type = "tag";
            }
        });

        // Target input
        const targetSetting = form.createDiv();
        targetSetting.addClass("setting-item");

        const targetSettingInfo = targetSetting.createDiv();
        targetSettingInfo.addClass("setting-item-info");

        targetSettingInfo.createEl("div", {
            text: "Target",
            cls: "setting-item-name",
        });

        targetSettingInfo.createEl("div", {
            text: "Enter the folder path or tag name",
            cls: "setting-item-description",
        });

        const targetSettingControl = targetSetting.createDiv();
        targetSettingControl.addClass("setting-item-control");

        this.targetInput = targetSettingControl.createEl("input", {
            type: "text",
            value: "",
            placeholder: "Enter folder path or tag name",
        });
        this.targetInput.addClass("target-input");

        const footerEl = contentEl.createDiv();
        footerEl.addClass("modal-button-container");

        footerEl
            .createEl("button", {
                text: "Cancel",
                cls: "mod-warning",
                attr: {
                    type: "button",
                },
            })
            .addEventListener("click", () => {
                this.close();
            });

        footerEl
            .createEl("button", {
                text: "Save",
                cls: "mod-cta",
                attr: {
                    type: "submit",
                },
            })
            .addEventListener("click", (e) => {
                e.preventDefault();
                this.save();
            });
    }

    save() {
        const target = this.targetInput.value.trim();
        if (target) {
            this.saveCallback(this.type, target);
            this.close();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
