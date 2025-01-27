import { Injectable } from '@angular/core';
import { IpcRenderer } from 'electron';
import * as opentype from 'opentype.js';
import { FontObject, FontObjectImpl, FontObjectEmpty } from '../utils/font-object';
import * as path from "path";
import * as fs from "fs";
export interface FolderItem {
	name: string;
	path: string;
	isExpandable: boolean;
	children: FolderItem[] | null;
	read(cb: () => void): void;
}
class Folder implements FolderItem {
	constructor(public name: string, public path: string) {}

	get isExpandable(): boolean {
		if (!this._folders) return true;
		return !!this._folders?.length;
	}
	// array of subfolders; null if no subfolders (no empty arrays returned)
	get children(): FolderItem[] | null {
		return this._folders?.length ? this._folders : null;
	}
	read(cb: () => void) {
		if (this._folders) {
			cb();
			return;
		}
		fs.readdir(this.path, {withFileTypes: true}, (err, files) => {
			if (err) {
				// console.log('readdir',err);
				this._folders = [];
			}
			else {
				this._folders = files
					.filter(de => de.isDirectory())
					.map(de => new Folder(de.name, path.resolve(this.path, de.name)));
			}
			cb();
		});
	}
	_folders: FolderItem[] | undefined;
}
@Injectable({
	providedIn: 'root'
})
export class FileService {
	ipc: IpcRenderer;
	// _root = "/usr/share/fonts";
	_root = "X:\software\system\Fonts\Malayalam fonts\Unicode Fonts";
	// _root = "/mnt/rox/archive/Fonty";
	constructor() {
		const require = (window as any).require;
		const electron = require && require('electron');
		this.ipc = electron?.ipcRenderer;
		if (!this.ipc) {
			// console.log("No ipc available");
			throw {message: "No IPC"};
		}
		// this.fs = fs.readFile;
	}
	getFolder(syspath: string): FolderItem {
		return new Folder(path.basename(syspath), syspath);
	}

	getRoot(): FolderItem[] {
		return [new Folder(path.basename(this._root), this._root)];
	}

	getFolders(path: string): string[] | null {
		return null;
	}

	isExpandable(path: string): boolean {
		return false;
	}

	getRootPath(): string {
		return this._root;
	}

	

	// xgetFolders(path?: string) {
	// 	//
	// 	fs.readdir(path || this._root, {withFileTypes: true}, (err, files) => {
	// 		if (err) {
	// 			//
	// 		}
	// 		else {
	// 			const e = files;
	// 		}
	// 	});
	// }
/*
	getFont(cb) {
		const fs = require("fs"); // as Node.FileSystem;
		const fontkit = require("fontkit");
		const rf = fs?.readFile;
		if (rf && fontkit) {
			rf("./Syntax-Roman.otf", {}, (err, data) => {
				if (err) {
					console.log(err);
				}
				else if (data) {
					console.log(data);
					//
					const font = fontkit.create(data);
					// fontkit.open("./Syntax-Roman.otf", "syn", (er, font) => {
					cb(font);
					if (font) {
						//
						// const n = font.fullName;
					}
				}
			});
		}
	}
*/

	getFonts(path: string, cb: (phase: 'start'|'next'|'end'|'aborted', index: number, total: number, font: FontObject | null) => void): {cancel: () => boolean} {
		const dir = path;
		const require = window.require;
		const { resolve, extname } = require('path');
		const { readdir, readFile } = require('fs').promises;
		let abort = false;
		const operation = {cancel: () => abort = true};

		async function* getFiles(dir: string): any {
			const dirents = await readdir(dir, { withFileTypes: true });
			if (abort) return;
			for (const dirent of dirents) {
				const res :string = resolve(dir, dirent.name);
				if (dirent.isDirectory()) {
					yield* getFiles(res);
				} else if (dirent.isFile()) {
					yield res;
				}
			}
		}

		(async () => {
			const fontFiles = [];
			for await (const file of getFiles(dir)) {
				const ext = extname(file);
				if (ext.match(/\.ttf|\.otf/i)) {
					fontFiles.push(file);

					// const data = await readFile(file);
					// const font = opentype.parse(data.buffer);
					// if (font) {
						// cb(new FontObject(font, file));
					// }
				}
			}

			if (abort) {
				cb('aborted', 0, 0, null);
				return;
			}

			cb('start', 0, fontFiles.length, null);

			let index = 0;
			for (const file of fontFiles) {
				const data = await readFile(file);
				try {
					const font = opentype.parse(data.buffer);
					if (font && !abort) {
						cb('next', index, fontFiles.length, new FontObjectImpl(font, file));
					}
				}
				catch (err) {
					// todo
					console.warn('error loading font', file, err);
					if (!abort) {
						cb('next', index, fontFiles.length, new FontObjectEmpty(err, file));
					}
				}
				index++;

				if (abort) {
					cb('aborted', 0, 0, null);
					return;
				}
			}

			cb(abort ? 'aborted' : 'end', 0, 0, null);
		})();

		return operation;
	}
}
