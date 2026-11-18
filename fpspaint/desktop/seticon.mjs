import * as ResEdit from 'resedit'; import * as PE from 'pe-library'; import fs from 'fs';
const f = 'dist/win-unpacked/FPSpaint.exe';
const exe = PE.NtExecutable.from(fs.readFileSync(f), { ignoreCert: true }); const res = PE.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync('build/icon.ico'));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries); const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if (vi) { vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'FPSpaint', FileDescription: 'FPSpaint', CompanyName: 'Nova_323', LegalCopyright: 'Nova_323', OriginalFilename: 'FPSpaint.exe', InternalName: 'FPSpaint' }); vi.setFileVersion(1, 0, 0, 0); vi.setProductVersion(1, 0, 0, 0); vi.outputToResourceEntries(res.entries); }
res.outputResource(exe); fs.writeFileSync(f, Buffer.from(exe.generate())); console.log('icono aplicado');
