"""Blender background exporter. Usage: blender -b --disable-autoexec --python tools/bake-armory.py -- INPUT_DIRECTORY OUTPUT_DIRECTORY"""
import bpy
import bmesh
import gzip
import json
from pathlib import Path
import sys
import tempfile
import zipfile
from mathutils import Matrix, Vector

source, output = map(Path, sys.argv[sys.argv.index('--') + 1:])
source, output = source.resolve(), output.resolve()
output.mkdir(parents=True, exist_ok=True)

def open_model(file, tmp):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if file.endswith('.glb'):
        bpy.ops.import_scene.gltf(filepath=str(source / file))
    else:
        with zipfile.ZipFile(source / file) as archive:
            blend = next(x for x in archive.namelist() if x.lower().endswith('.blend'))
            folder = Path(tmp) / file
            folder.mkdir()
            path = folder / Path(blend).name
            path.write_bytes(archive.read(blend))
            bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
            for image in bpy.data.images:
                if image.source == 'FILE' and not image.packed_file:
                    name = Path(image.filepath).name
                    record = next((x for x in archive.namelist() if Path(x).name == name and not x.endswith('/')), None)
                    if record:
                        path = folder / name
                        path.write_bytes(archive.read(record))
                        image.filepath = str(path)
                        image.reload()
                        image.pack()

def box(objects):
    pts = [o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
    return [(min(v[i] for v in pts), max(v[i] for v in pts)) for i in range(3)]

def world_matrix(origin, scale):
    # Author's +X is the muzzle, +Z the vertical. glTF gets -Z and +Y.
    return Matrix(((0,-scale,0,0),(scale,0,0,0),(0,0,scale,0),(0,0,0,1))) @ Matrix.Translation(-Vector(origin))

def select_groups(groups):
    bpy.ops.object.select_all(action='DESELECT')
    for group in groups:
        group.select_set(True)
        for child in group.children:
            child.select_set(True)

def export_groups(target, records):
    groups = []
    for key, objects, origin, scale in records:
        group = bpy.data.objects.new(key, None)
        bpy.context.scene.collection.objects.link(group)
        groups.append(group)
        matrix = world_matrix(origin, scale)
        for obj in objects:
            data = obj.data.copy()
            data.transform(matrix @ obj.matrix_world)
            clone = bpy.data.objects.new(obj.name + ' baked', data)
            bpy.context.scene.collection.objects.link(clone)
            clone.parent = group
            # The HUD supplies its own collimated aiming point.
            if key.startswith('sight-'):
                bm = bmesh.new()
                bm.from_mesh(data)
                bmesh.ops.delete(bm, geom=[f for f in bm.faces if 'emission' in data.materials[f.material_index].name.lower()], context='FACES')
                bm.to_mesh(data)
                bm.free()
    select_groups(groups)
    bpy.ops.export_scene.gltf(filepath=str(output / target), export_format='GLB', use_selection=True,
                              export_animations=False, export_cameras=False, export_lights=False)
    path = output / target
    (output / (target + '.gz')).write_bytes(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0))
    path.unlink()

def classify(o, rules):
    name = (o.parent.name if o.parent and o.name.startswith('Object_') else o.name).lower()
    return next((key for phrase,key in rules if phrase in name), 'body')

configs = [
 ('rifle', 'low-poly_colt_m4a1.glb', .10, (-1.28,0,-.23), [ ('mag empty','magazine'), ('30rnd mag (','skip'), ('55645','skip'), ('carry handle','irons'),('charging handle','charging'),('m4a1 bolt_','bolt'),('trigga','trigger') ]),
 ('smg', 'low-poly_hk_mp7_a1.glb', .10, (-.39,0,-.17), [ ('empty mag','magazine'), ('30rnd mag','skip'), ('4.6x30','skip'), ('4630_','skip'), ('iron sight','irons'),('suppressor','internal-can'),('charging handle','charging'),('bolt carrier','bolt'),('trigga','trigger') ]),
 ('pistol', 'low-poly_colt_m45a1.glb', .10, (-.38,0,.11), [ ('8rnd empty','magazine'), ('8rnd (','skip'), ('45acp_','skip'), ('slide & bolt','slide'),('trigga','trigger') ]),
 ('mcx', 'low-poly-sig-sauer-mcx-legacy.zip', .10, (-1.25,0,-.21), [ ('mag empty','magazine'), ('55645','skip'), ('5.56x45','skip'), ('iron sight','irons'),('charging handle','charging'),('bolt carrier','bolt'),('trigga','trigger') ]),
 ('toz', 'low-poly-toz-34.zip', .063, (-1.65,0,-.11), [ ('1276','skip'), ('12/76','skip'), ('barrels','break-action'), ('extractor','break-action'), ('cube','break-action') ]),
]

catalog = {}
with tempfile.TemporaryDirectory() as tmp:
    for id,file,scale,origin,rules in configs:
        open_model(file,tmp)
        grouped = {}
        for obj in bpy.context.scene.objects:
            if obj.type=='MESH':
                grouped.setdefault(classify(obj,rules), []).append(obj)
        grouped.pop('skip',None)
        records = [(key, objects, origin, scale) for key,objects in grouped.items()]
        bounds = { key: box(objects) for key,objects in grouped.items() }
        def point(x,y,z):
            return [round(-y*scale,6),round((z-origin[2])*scale,6),round(-(x-origin[0])*scale,6)]
        def p(v):
            return point(v[0],v[1],v[2])
        dimensions = {
            'rifle': ((3.9105,0,.22),(-.9,0,.537),(-1.53,0,.895),(-1.73,-.24,-.28),(1.13,.31,.05),(-.28,0,-.27),(-.52,-.26,.19)),
            'smg': ((2.0767,0,.306),(-.36,0,.80),(-1.4,0,.92),(-.54,-.21,.12),(.96,.24,.18),(-.45,0,.16),(.55,-.24,.39)),
            'pistol': ((1.1387,0,.51),(-.67,0,.65),(-.74,0,.70),(-.74,-.21,.11),(-.62,.23,-.04),(-.55,0,.24),(-.12,-.15,.51)),
            'mcx': ((4.3701,0,.222),(-.43,0,.612),(-1.35,0,.95),(-1.64,-.23,-.09),(1.71,.26,.13),(-.33,0,-.20),(-.45,-.25,.22)),
            'toz': ((11.0679,0,.59),(0,0,.80),(-.65,0,.80),(-2.25,-.22,.1),(4.2,.22,.03),(-.38,0,.28),(-.38,-.22,.47))
        }[id]
        muzzle, mount, iron, right, left, magazine, eject = map(p,dimensions)
        item = dict(groups=list(grouped), muzzle=muzzle, mount=mount, irons=iron, gripR=right, gripL=left,
                    magazine=magazine,eject=eject, trigger=p(((bounds['trigger'][0][0]+bounds['trigger'][0][1])/2,0,bounds['trigger'][2][1])) if 'trigger' in bounds else right)
        if 'internal-can' in grouped:
            item['canCrown'] = point(bounds['internal-can'][0][1] - .50,0,.306)[2]
        if id == 'toz':
            item['hinge'] = point(-.37,0,.30)
            item['lowerMuzzleY'] = point(11,0,.33)[1]
        catalog[id] = item
        export_groups(id+'.glb', records)
    open_model('low-poly-collimator-set.zip',tmp)
    sights = [
      ('reddot','holosun 403r',(.47,0,-.6181),(.1882,0,-.142),.1,.009),
      ('holo','eotech exps3',(-.34,0,-.6473),(-.4166,0,-.10),.1,.011),
      ('aimpoint','aimpoint comp m4',(-1.07,0,.1565),(-1.6386,0,.6531),.1,.013),
      ('vortex','vortex amg uh-1',(.13,0,.1816),(-.1961,0,.6612),.1,.011),
      ('reflex','holosun 510c',(1.06,0,.1994),(1.311,0,.6147),.1,.012),
    ]
    catalog['sights'] = {}
    records=[]
    for id,name,origin,lens,scale,aperture in sights:
        catalog['sights'][id] = dict(lens=[0, round((lens[2]-origin[2])*scale,6), round(-(lens[0]-origin[0])*scale,6)], aperture=aperture)
        records.append(('sight-'+id,[bpy.data.objects[name]],origin,scale))
    export_groups('sights.glb',records)
    open_model('low-poly-muzzle-device-set.zip',tmp)
    records=[]
    catalog['suppressors'] = {}
    for id,name,axis in [('rifle','sil 5.56m',-.6),('pistol','sil 9mm',.6)]:
        obj=bpy.data.objects[name]
        extent=box([obj])[0]
        catalog['suppressors'][id]=round(-(extent[1]-extent[0])*.1,6)
        records.append(('can-'+id,[obj],(extent[0],0,axis),.1))
    export_groups('suppressors.glb',records)
(output / 'catalog.json').write_text(json.dumps(catalog, indent=2)+'\n')
