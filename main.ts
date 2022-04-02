import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian'

interface WordLimitSettings {
	limit: number
	type: string
}
const DEFAULT_SETTINGS: WordLimitSettings = {
	limit: 200,
	type: 'word'
}
const Types = new Map([
	['line', {
		value: 'line',
		display: 'lines',
		min: 5,
		max: 100,
		step: 5
	}],
	['word', {
		value: 'word',
		display: 'words',
		min: 100,
		max: 1000,
		step: 50
	}],
	['char', {
		value: 'char',
		display: 'characters',
		min: 1000,
		max: 10000,
		step: 500
	}]])

export default class WordLimit extends Plugin {
	settings: WordLimitSettings

	statusBar: HTMLElement
	eventHandlers = new Map()

	async onload() {
		// load settings
		await this.loadSettings()

		// helper functions
		const getViewData = (): string => {
			const data = this.app.workspace.getActiveViewOfType(MarkdownView).getViewData()
			const noYAML = (str: string): string => str.replace(/^---.*---/s, '')
			const noLink = (str: string): string => str.replace(/(\[{2}.*\|)|(\]\(.*\))/g, '')
			const noHTML = (str: string): string => str.replace(/<(.*)>.?|<(.*) \/>/g, '')
			const noSymbols = (str:string): string => str.replace(/\P{Letter}/gu, '')
			return noSymbols((noHTML(noLink(noYAML(data)))))
		}
		const getChars = (): number =>
			/*	quick and dirty rough char count */
			getViewData().replace(/\s+/g,'').length
		const getWords = (): number =>
			/* quick and dirty rough word count */
			getViewData().split(/\s+/).length
		const getLines = (): number =>
			/* quick and dirty rough line count */
			getViewData().split(/\r\n/).length
		const getRemaining = (type: string, limit: number): number => {
			switch (type) {
				case 'char': return limit - getChars()
				case 'word': return limit - getWords()
				case 'line': return limit - getLines()
		}}
		const updateStatusBar = (statusBarItem: HTMLElement, remaining: number) =>
			statusBarItem.setText(
				Math.abs(remaining) + ' ' +
				Types.get(this.settings.type).display + ' ' +
				(Math.sign(remaining) === -1 ? 'over limit' : 'remaining')
			)

		// add status bar
		this.statusBar = this.addStatusBarItem()
		updateStatusBar(this.statusBar, getRemaining(this.settings.type, this.settings.limit))

		// add event listeners
		/* might change handler keys to include workspace or vault */
		this.eventHandlers.set('editor-change', () => {
			const remaining = getRemaining(this.settings.type, this.settings.limit)
			if (remaining < 0)
				new Notice(`you've gone over your ${Types.get(this.settings.type).display.slice(0, -1)} limit!`)
			updateStatusBar(this.statusBar, remaining)
		})
		this.eventHandlers.set('active-leaf-change', () => {
			const remaining = getRemaining(this.settings.type, this.settings.limit)
			if (remaining < 0)
				new Notice(`this file is over your ${Types.get(this.settings.type).display.slice(0, -1)} limit!`)
			updateStatusBar(this.statusBar,remaining)
		})
		this.eventHandlers.forEach((value, name) =>
			/* -@ts-ignore the overloads are getting confused by name being type string 
			    @ts-ignore because they're defined with specific strings like 'quit' */
			this.registerEvent(this.app.workspace.on(name, value)))
		// add settings tab
		this.addSettingTab(new SettingsTab(this.app, this))
	}

	async onunload() {
		// remove event listeners
		this.eventHandlers.forEach((value,name) =>
			this.app.workspace.off(name,value)
	)}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
	}
	async saveSettings() {
		await this.saveData(this.settings)
		// update status bar to match new settings
		this.statusBar.setText(`${this.settings.limit} ${Types.get(this.settings.type).display} maximum`)
	}
}
class SettingsTab extends PluginSettingTab {
	plugin: WordLimit
	limits: Setting
	constructor(app: App, plugin: WordLimit) {
		super(app, plugin)
		this.plugin = plugin
	}
	setLimitSlider(): void {
		/* allows for changing limit slider parameters after initial display */
		this.limits
			.clear()
			.setName('limit')
			.setDesc(`set your ${Types.get(this.plugin.settings.type).display.slice(0, -1)} limit`)
			.addSlider(slider => slider
				.setLimits(
					Types.get(this.plugin.settings.type).min,
					Types.get(this.plugin.settings.type).max,
					Types.get(this.plugin.settings.type).step)
				.setValue(Types.get(this.plugin.settings.type).min)
				.setDynamicTooltip()
				.onChange(async value => {
					this.plugin.settings.limit = value
					await this.plugin.saveSettings()
				}))
	}
	display(): void {
		// clear old settings
		this.containerEl.empty()

		// add type dropdown
		new Setting(this.containerEl)
			.setName('limit type')
			.setDesc('set the type of limit')
			.addDropdown(dropdown => dropdown
				.addOption(Types.get('char').value, Types.get('char').display)
				.addOption(Types.get('word').value, Types.get('word').display)
				.addOption(Types.get('line').value, Types.get('line').display)
				.setValue(Types.get(this.plugin.settings.type).value)
				.onChange(async value => {
					this.plugin.settings.type = value
					this.plugin.settings.limit = Types.get(this.plugin.settings.type).min
					this.setLimitSlider()
					await this.plugin.saveSettings()
				}))

		// add limit slider
		this.limits = new Setting(this.containerEl)
		this.setLimitSlider()
	}
}
