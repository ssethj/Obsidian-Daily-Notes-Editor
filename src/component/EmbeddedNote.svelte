<script lang="ts">
    import type DailyNoteViewPlugin from "../dailyNoteViewIndex";
    import {
        Component,
        MarkdownRenderer,
        TFile,
    } from "obsidian";
    import { onDestroy } from "svelte";

    export let plugin: DailyNoteViewPlugin;
    export let notePath: string;

    let containerEl: HTMLElement;
    let renderComponent: Component | null = null;
    let error: string = "";
    let title: string = "";
    // Used to make sure only the most recent async render actually appends content,
    // preventing the note from being rendered more than once.
    let renderToken: number = 0;

    function resolveFile(pathOrName: string): TFile | null {
        const abstract = plugin.app.vault.getAbstractFileByPath(pathOrName);
        if (abstract instanceof TFile) return abstract;
        // Fallback: resolve like an Obsidian link (by basename/path)
        const dest = plugin.app.metadataCache.getFirstLinkpathDest(
            pathOrName,
            ""
        );
        if (dest instanceof TFile) return dest;
        return null;
    }

    function stripFrontmatter(content: string): string {
        const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
        return match ? content.slice(match[0].length) : content;
    }

    function handleTitleClick() {
        const file = resolveFile(notePath);
        if (file) {
            plugin.app.workspace.getLeaf(false).openFile(file);
        }
    }

    // MarkdownRenderer.render() does not attach link-click handlers by
    // itself (that wiring lives in Obsidian's real preview views). Without
    // this handler a clicked wikilink performs the anchor's default browser
    // navigation, and since the href has no matching app:// route Obsidian
    // reloads the whole app window. Intercept the click and open the link
    // through the workspace API instead.
    function handleNoteLinkClick(ev: MouseEvent, sourcePath: string) {
        if (ev.button !== 0 && ev.button !== 1) return;

        const target = ev.target as Element | null;
        if (!target) return;

        const link = target.closest("a.internal-link") as
            | HTMLAnchorElement
            | null;
        if (!link) return;

        const linkText =
            link.getAttribute("data-href") ?? link.getAttribute("href");
        if (!linkText) return;

        ev.preventDefault();
        ev.stopPropagation();

        if (ev.altKey) {
            plugin.app.workspace.openLinkText(linkText, sourcePath, "split");
        } else {
            // Always open in a new tab so the linked note does not replace
            // the Daily Notes editor view.
            plugin.app.workspace.openLinkText(linkText, sourcePath, "tab");
        }
    }

    async function renderNote() {
        if (!containerEl || !notePath) return;

        // Invalidate any in-flight render; only the newest request may append.
        const token = ++renderToken;

        // Unload any previously rendered content before rendering fresh content
        if (renderComponent) {
            renderComponent.unload();
            renderComponent = null;
        }
        containerEl.empty();
        error = "";
        title = "";

        const file = resolveFile(notePath);
        if (!file) {
            error = `Note not found: ${notePath}`;
            return;
        }

        title = file.basename;
        const content = await plugin.app.vault.cachedRead(file);
        // A newer render was requested while we were reading; abort this one.
        if (token !== renderToken) return;

        const bodyContent = stripFrontmatter(content);

        const newComponent = new Component();
        newComponent.load();
        renderComponent = newComponent;

        await MarkdownRenderer.render(
            plugin.app,
            bodyContent,
            containerEl,
            file.path,
            newComponent
        );

        // Make the freshly rendered wikilinks clickable without the "default
        // anchor navigation reloads the app" problem. Registered on the render
        // component so it is detached automatically when the note unloads.
        newComponent.registerDomEvent(
            containerEl,
            "click",
            (ev: MouseEvent) => handleNoteLinkClick(ev, file.path)
        );
    }

    // Single entry point: fires on mount (once containerEl is bound) and
    // whenever notePath changes.
    $: if (containerEl && notePath) {
        renderNote();
    }

    onDestroy(() => {
        if (renderComponent) {
            renderComponent.unload();
            renderComponent = null;
        }
    });
</script>

{#if notePath}
    <div class="daily-note-wrapper embedded-note">
        <div class="daily-note-title embedded-note-title inline-title">
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-interactive-supports-focus -->
            <span role="link" class="embedded-note-label">Embedded:</span>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-interactive-supports-focus -->
            <span
                role="link"
                class="clickable-link"
                on:click={handleTitleClick}
            >{title || notePath}</span>
        </div>
        <div class="embedded-note-content" bind:this={containerEl}>
            {#if error}
                <div class="embedded-note-error">{error}</div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .embedded-note {
        margin-bottom: var(--size-4-5);
        padding-bottom: var(--size-4-8);
    }

    .embedded-note-title {
        display: flex;
        align-items: center;
        justify-content: start;
        gap: var(--size-4-2);
        color: var(--text-muted);
        font-weight: 500;
        margin-bottom: var(--size-4-4);
    }

    .embedded-note-label {
        color: var(--text-faint);
        text-transform: uppercase;
        font-size: 0.75em;
        letter-spacing: 0.05em;
    }

    .embedded-note-content {
        min-height: 24px;
    }

    .embedded-note-content > :global(.markdown-preview-view) {
        padding: 0;
    }

    .embedded-note-error {
        color: var(--text-error);
        font-style: italic;
    }
</style>
