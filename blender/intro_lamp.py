"""
Hull Bracers - intro cinematic "The Lamp"  (Blender 4.2+ / 5.x)

First-person shot: a living room at night. You sit on the couch looking out
the window. One of the two lamps on the TV console flickers. You get up,
walk over and reach for it. A voice behind you shouts "No, don't!" - too
late. Reality glitches, whites out, and you wake up in the mirrored neon
void: a black plane with a white and blue skyline and a neon ghost of the
room you just left.

The whole scene is built procedurally - no external assets needed.

HOW TO RUN
  In Blender: Scripting workspace > Text > Open > this file > Run Script.
  WARNING: this deletes every object in the current file and rebuilds the
  scene, so run it in a new, empty file.

  From a terminal (no UI):
    blender --background --python intro_lamp.py -- --render
  Extra flags after "--":
    --render    render the animation to RENDER_PATH after building
    --preview   quarter-quality draft (960x540, few samples)
    --use-cycles  render with Cycles instead of EEVEE
    --save      save the built scene as intro_lamp.blend next to this script

Every beat lives in the BEATS table below (in seconds); retime the scene by
editing it. Timeline markers are added for each beat so they're easy to
find in Blender.
"""

import math
import os
import random
import sys

import bpy  # must come first when run as the standalone bpy module
import bmesh
from mathutils import Euler, Vector

# --------------------------------------------------------------- settings

FPS = 24
RESOLUTION = (1920, 1080)
SUBTITLES = True       # burn the "No, don't!" line into the video
VOICE_FILE = ''        # optional path to a recorded "No, don't!" (wav/mp3/ogg)
SEED = 7               # changes the glitch pattern, flicker and skyline

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in ARGS
USE_CYCLES = '--use-cycles' in ARGS

# Beats, in seconds.
BEATS = {
    'sit': 0.0,          # seated, looking at the window
    'flicker1': 2.4,     # first lamp flicker
    'turn': 2.6,         # head turns toward the lamp
    'flicker2': 3.9,
    'stand': 4.5,        # get up off the couch
    'walk': 5.3,         # walk to the console
    'reach': 7.8,        # lean in, hand reaches for the lamp
    'voice': 9.0,        # "No, don't!" from behind
    'touch': 9.4,        # fingertip meets the lamp -> glitch
    'whiteout': 10.6,
    'black': 11.0,       # eyes shut; cut to the void
    'wake': 12.2,        # eyes flutter open, lying on the mirror floor
    'rise': 14.0,        # sit / stand up facing the neon ghost lamp
    'turnback': 16.2,    # turn to face the skyline
    'end': 19.0,
}

# World layout (metres). The void is built far from the room so the camera
# can cut between them.
VOID = Vector((400.0, 0.0, 0.0))
SEAT_EYE = Vector((0.25, -1.95, 1.12))
STAND_EYE = Vector((0.25, -1.6, 1.62))
NEAR_EYE = Vector((-0.85, 1.75, 1.6))
LEAN_EYE = Vector((-0.95, 2.05, 1.45))
WINDOW_LOOK = Vector((3.0, -0.8, 1.35))
LAMP_POS = Vector((-1.0, 2.75, 0.6))       # base of the strange lamp (on the console)
SHADE_CENTER = LAMP_POS + Vector((0, 0, 0.41))

WARM = (1.0, 0.62, 0.32)
COLD = (0.55, 0.8, 1.0)
NEON_BLUE = (0.25, 0.6, 1.0)
NEON_WHITE = (0.85, 0.93, 1.0)
SHADE_GLOW = 1.6


def F(seconds):
    return int(round(seconds * FPS)) + 1


def B(name):
    return BEATS[name]


rng = random.Random(SEED)

# ---------------------------------------------------------------- helpers


def clear_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for ng in list(bpy.data.node_groups):
        if ng.name.startswith('HB_'):
            bpy.data.node_groups.remove(ng)
    bpy.data.orphans_purge(do_recursive=True)


def collection(name):
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def set_input(node, name, value):
    sock = node.inputs.get(name)
    if sock is not None:
        sock.default_value = value
    return sock


def new_material(name):
    mat = bpy.data.materials.new(name)
    if mat.node_tree is None:  # Blender 4.x; 5.x materials always have nodes
        mat.use_nodes = True
    mat.node_tree.nodes.clear()
    return mat, mat.node_tree.nodes, mat.node_tree.links


def principled(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0, sss=0.0):
    mat, nodes, links = new_material(name)
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    set_input(bsdf, 'Base Color', (*color, 1))
    set_input(bsdf, 'Roughness', rough)
    set_input(bsdf, 'Metallic', metal)
    if emit:
        set_input(bsdf, 'Emission Color', (*emit, 1))
        set_input(bsdf, 'Emission Strength', strength)
    if sss:
        set_input(bsdf, 'Subsurface Weight', sss)
    links.new(bsdf.outputs[0], out.inputs['Surface'])
    mat.diffuse_color = (*color, 1)
    return mat


def emission(name, color, strength):
    mat, nodes, links = new_material(name)
    out = nodes.new('ShaderNodeOutputMaterial')
    em = nodes.new('ShaderNodeEmission')
    set_input(em, 'Color', (*color, 1))
    set_input(em, 'Strength', strength)
    links.new(em.outputs[0], out.inputs['Surface'])
    return mat


def fade_material(name, color, strength):
    """Emission that can fade in/out via the mix factor (0 = invisible)."""
    mat, nodes, links = new_material(name)
    out = nodes.new('ShaderNodeOutputMaterial')
    em = nodes.new('ShaderNodeEmission')
    tr = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    set_input(em, 'Color', (*color, 1))
    set_input(em, 'Strength', strength)
    mix.inputs[0].default_value = 0.0
    links.new(tr.outputs[0], mix.inputs[1])
    links.new(em.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], out.inputs['Surface'])
    if hasattr(mat, 'surface_render_method'):
        mat.surface_render_method = 'BLENDED'
    elif hasattr(mat, 'blend_method'):
        mat.blend_method = 'BLEND'
    return mat, mix


def link_mesh(name, bm, mat, loc, coll, smooth=False):
    if smooth:
        for f in bm.faces:
            f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    coll.objects.link(ob)
    if mat:
        me.materials.append(mat)
    return ob


def box(name, size, loc, mat, coll, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    ob = link_mesh(name, bm, mat, loc, coll)
    if bevel:
        mod = ob.modifiers.new('Bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    return ob


def cone(name, r1, r2, depth, loc, mat, coll, segments=32, cap=True, pivot_end=False):
    """Cylinder/cone along Z. pivot_end: origin at the r1 end, extending to -Z."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=segments,
                          radius1=r2 if pivot_end else r1, radius2=r1 if pivot_end else r2, depth=depth)
    if pivot_end:
        bmesh.ops.translate(bm, vec=(0, 0, -depth / 2), verts=bm.verts)
    return link_mesh(name, bm, mat, loc, coll, smooth=True)


def sphere(name, r, loc, mat, coll, subdiv=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    return link_mesh(name, bm, mat, loc, coll, smooth=subdiv > 1)


def point_light(name, loc, energy, color, coll, radius=0.05):
    data = bpy.data.lights.new(name, 'POINT')
    data.energy = energy
    data.color = color
    data.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, data)
    ob.location = loc
    coll.objects.link(ob)
    return ob


def key_socket(sock, frame, value):
    sock.default_value = value
    sock.keyframe_insert('default_value', frame=frame)


def fcurves(idblock):
    """F-curves of an ID's action (layered actions in 4.4+, legacy before)."""
    ad = getattr(idblock, 'animation_data', None)
    if not ad or not ad.action:
        return []
    try:
        from bpy_extras.anim_utils import action_get_channelbag_for_slot
        bag = action_get_channelbag_for_slot(ad.action, ad.action_slot)
        if bag:
            return list(bag.fcurves)
    except ImportError:
        pass
    return list(ad.action.fcurves)


def snap(idblock, prefix=''):
    """Make keys on idblock (whose data path starts with prefix) cut instead of ease."""
    for fc in fcurves(idblock):
        if fc.data_path.startswith(prefix):
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT'


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * t * (t * (t * 6 - 15) + 10)


def span(t, a, b):
    """0..1 eased progress of time t through [a, b]."""
    return smooth((t - a) / (b - a)) if b > a else float(t >= b)


class Wobble:
    """Deterministic smooth noise in roughly [-1, 1]."""

    def __init__(self, octaves=3):
        self.parts = [(rng.uniform(0.6, 1.4) * (i + 1), rng.uniform(0, math.tau)) for i in range(octaves)]

    def __call__(self, t):
        return sum(math.sin(t * f * 2.0 + ph) / (i + 1) for i, (f, ph) in enumerate(self.parts)) / 1.8


def heading_pitch(eye, target):
    d = target - eye
    return math.atan2(d.y, d.x), math.atan2(d.z, math.hypot(d.x, d.y))


def cam_euler(h, pitch, roll=0.0):
    # Blender cameras look down -Z: X=90deg looks along +Y, then yaw about Z.
    return Euler((math.pi / 2 + pitch, roll, h - math.pi / 2), 'XYZ')


# --------------------------------------------------------- scene settings

def setup_scene():
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 1
    scene.frame_end = F(B('end'))
    scale = 0.5 if PREVIEW else 1.0
    scene.render.resolution_x = int(RESOLUTION[0] * scale)
    scene.render.resolution_y = int(RESOLUTION[1] * scale)
    scene.render.resolution_percentage = 100
    scene.render.use_motion_blur = False  # the glitch cuts would smear

    if USE_CYCLES:
        import addon_utils
        addon_utils.enable('cycles', default_set=True)
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 24 if PREVIEW else 160
        scene.cycles.use_denoising = True
    else:
        engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
        scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
        ee = scene.eevee
        ee.taa_render_samples = 16 if PREVIEW else 96
        if hasattr(ee, 'use_raytracing'):
            ee.use_raytracing = True  # mirror-floor reflections in the void
        if hasattr(ee, 'use_bloom'):
            ee.use_bloom = True  # Blender < 4.2 (newer versions bloom in the compositor)

    vs = scene.view_settings
    try:
        vs.view_transform = 'AgX'
        for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
            try:
                vs.look = look
                break
            except TypeError:
                pass
    except TypeError:
        pass
    return scene


def setup_world(scene):
    world = bpy.data.worlds.new('HB_World')
    scene.world = world
    if world.node_tree is None:  # Blender 4.x
        world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    color = bg.inputs['Color']
    key_socket(color, 1, (0.004, 0.006, 0.014, 1))        # night room
    key_socket(color, F(B('black')), (0.0, 0.0, 0.0, 1))  # the void
    snap(world.node_tree)


def setup_compositor(scene):
    """Bloom + animated chromatic aberration for the glitch. Optional."""
    try:
        if hasattr(scene, 'compositing_node_group'):  # Blender 5.x
            tree = bpy.data.node_groups.new('HB_Compositor', 'CompositorNodeTree')
            tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
            scene.compositing_node_group = tree
            out = tree.nodes.new('NodeGroupOutput')
        else:  # Blender 4.x
            scene.use_nodes = True
            tree = scene.node_tree
            tree.nodes.clear()
            out = tree.nodes.new('CompositorNodeComposite')
        rl = tree.nodes.new('CompositorNodeRLayers')
        glare = tree.nodes.new('CompositorNodeGlare')
        lens = tree.nodes.new('CompositorNodeLensdist')
        if 'Type' in glare.inputs:
            glare.inputs['Type'].default_value = 'Bloom'
            set_input(glare, 'Threshold', 0.8)
            set_input(glare, 'Strength', 0.6)
            set_input(glare, 'Size', 0.6)
        else:
            glare.glare_type = 'BLOOM' if 'BLOOM' in [e.identifier for e in glare.bl_rna.properties['glare_type'].enum_items] else 'FOG_GLOW'
            glare.threshold = 0.8
        tree.links.new(rl.outputs['Image'], glare.inputs['Image'])
        tree.links.new(glare.outputs['Image'], lens.inputs['Image'])
        tree.links.new(lens.outputs['Image'], out.inputs[0])
        if hasattr(scene.render, 'use_compositing'):
            scene.render.use_compositing = True
        if hasattr(scene.render, 'compositor_device'):
            scene.render.compositor_device = 'CPU'  # works on every machine, incl. headless
        return lens
    except Exception as exc:  # never let post effects break the build
        print(f'[intro] compositor skipped: {exc}')
        return None


# ------------------------------------------------------------- the room

def build_room():
    coll = collection('HB_Room')
    wall = principled('HB_Wall', (0.16, 0.15, 0.17), rough=0.9)
    floor = principled('HB_Floor', (0.12, 0.08, 0.06), rough=0.45)
    fabric = principled('HB_Couch', (0.09, 0.12, 0.16), rough=0.95)
    wood = principled('HB_Console', (0.07, 0.045, 0.03), rough=0.35)
    rug = principled('HB_Rug', (0.22, 0.2, 0.18), rough=1.0)
    screen = principled('HB_TVScreen', (0.005, 0.005, 0.007), rough=0.08)
    plastic = principled('HB_TVBody', (0.02, 0.02, 0.022), rough=0.4)
    brass = principled('HB_Brass', (0.8, 0.55, 0.25), rough=0.25, metal=1.0)
    ceramic = principled('HB_Ceramic', (0.75, 0.72, 0.66), rough=0.3)
    leaf = principled('HB_Leaf', (0.05, 0.12, 0.05), rough=0.7)
    frame_mat = principled('HB_Frame', (0.02, 0.02, 0.02), rough=0.5)
    art = principled('HB_Art', (0.15, 0.2, 0.3), rough=0.8)
    glass = emission('HB_Moon', (0.3, 0.42, 0.7), 0.18)

    W, D, H = 6.0, 6.0, 2.7
    box('Floor', (W, D, 0.1), (0, 0, -0.05), floor, coll)
    box('Ceiling', (W, D, 0.1), (0, 0, H + 0.05), wall, coll)
    box('Wall_TV', (W, 0.1, H), (0, D / 2 + 0.05, H / 2), wall, coll)
    box('Wall_Back', (W, 0.1, H), (0, -D / 2 - 0.05, H / 2), wall, coll)
    box('Wall_Left', (0.1, D, H), (-W / 2 - 0.05, 0, H / 2), wall, coll)
    # Right wall with a window.
    # Window opening spans y -1.0..0.6; wall pieces meet it exactly.
    box('Wall_Right_A', (0.1, 2.4, H), (W / 2 + 0.05, 1.8, H / 2), wall, coll)
    box('Wall_Right_B', (0.1, 2.0, H), (W / 2 + 0.05, -2.0, H / 2), wall, coll)
    box('Wall_Right_Low', (0.1, 1.6, 0.9), (W / 2 + 0.05, -0.4 + 0.2, 0.45), wall, coll)
    box('Wall_Right_High', (0.1, 1.6, 0.5), (W / 2 + 0.05, -0.4 + 0.2, H - 0.25), wall, coll)
    box('Window_Night', (0.02, 1.6, 1.3), (W / 2 + 0.12, -0.2, 1.55), glass, coll)
    box('Window_Mullion', (0.04, 0.04, 1.3), (W / 2 + 0.06, -0.2, 1.55), frame_mat, coll)

    moon = bpy.data.lights.new('Moonlight', 'AREA')
    moon.energy = 60
    moon.color = (0.55, 0.7, 1.0)
    moon.size = 1.6
    moon.size_y = 1.3
    moon.shape = 'RECTANGLE'
    moon_ob = bpy.data.objects.new('Moonlight', moon)
    moon_ob.location = (W / 2 - 0.05, -0.2, 1.55)
    moon_ob.rotation_euler = (0, -math.pi / 2, 0)
    coll.objects.link(moon_ob)

    fill = bpy.data.lights.new('Fill', 'AREA')
    fill.energy = 8
    fill.size = 4
    fill.color = (0.5, 0.55, 0.8)
    fill_ob = bpy.data.objects.new('Fill', fill)
    fill_ob.location = (0, 0, H - 0.05)
    coll.objects.link(fill_ob)

    furniture = []
    # Couch, facing the TV wall (+Y).
    furniture += [
        box('Couch_Base', (2.2, 0.95, 0.42), (0, -2.15, 0.21), fabric, coll, bevel=0.04),
        box('Couch_Back', (2.2, 0.25, 0.55), (0, -2.55, 0.68), fabric, coll, bevel=0.06),
        box('Couch_Arm_L', (0.22, 0.95, 0.62), (-1.21, -2.15, 0.31), fabric, coll, bevel=0.06),
        box('Couch_Arm_R', (0.22, 0.95, 0.62), (1.21, -2.15, 0.31), fabric, coll, bevel=0.06),
        box('Cushion_L', (1.0, 0.7, 0.14), (-0.52, -2.05, 0.49), fabric, coll, bevel=0.05),
        box('Cushion_R', (1.0, 0.7, 0.14), (0.52, -2.05, 0.49), fabric, coll, bevel=0.05),
    ]
    furniture += [
        box('Rug', (2.6, 1.8, 0.01), (0, -0.6, 0.005), rug, coll),
        box('CoffeeTable', (0.9, 0.5, 0.06), (0.95, -0.85, 0.42), wood, coll, bevel=0.01),
        box('CoffeeTable_Legs', (0.8, 0.4, 0.39), (0.95, -0.85, 0.195), wood, coll),
        # TV console + TV.
        box('Console', (2.5, 0.45, 0.6), (0, 2.75, 0.3), wood, coll, bevel=0.01),
        box('TV_Body', (1.45, 0.06, 0.84), (0, 2.85, 1.08), plastic, coll, bevel=0.005),
        box('TV_Screen', (1.39, 0.01, 0.78), (0, 2.815, 1.08), screen, coll),
        box('TV_Stand', (0.3, 0.2, 0.04), (0, 2.82, 0.62), plastic, coll),
        # Wall art + plant.
        box('Frame_1', (0.6, 0.03, 0.8), (-2.2, 2.98, 1.6), frame_mat, coll),
        box('Art_1', (0.52, 0.01, 0.72), (-2.2, 2.96, 1.6), art, coll),
        cone('PlantPot', 0.16, 0.12, 0.35, (2.4, 2.6, 0.175), ceramic, coll),
        sphere('PlantLeaves', 0.38, (2.4, 2.6, 0.75), leaf, coll, subdiv=1),
    ]

    lamps = {}
    for side, x in (('strange', LAMP_POS.x), ('plain', -LAMP_POS.x)):
        base = LAMP_POS.copy()
        base.x = x
        metal = brass if side == 'strange' else ceramic
        shade = principled(f'HB_Shade_{side}', (0.9, 0.82, 0.68), rough=0.7, emit=WARM, strength=SHADE_GLOW)
        parts = [
            cone(f'Lamp_{side}_Base', 0.09, 0.09, 0.03, base + Vector((0, 0, 0.015)), metal, coll),
            cone(f'Lamp_{side}_Body', 0.05, 0.075, 0.28, base + Vector((0, 0, 0.17)), metal, coll),
            cone(f'Lamp_{side}_Neck', 0.012, 0.012, 0.08, base + Vector((0, 0, 0.35)), metal, coll),
            cone(f'Lamp_{side}_Shade', 0.17, 0.11, 0.22, base + Vector((0, 0, 0.41)), shade, coll, cap=False),
        ]
        light = point_light(f'Lamp_{side}_Light', base + Vector((0, 0, 0.42)), 35.0, WARM, coll, radius=0.08)
        furniture += parts
        lamps[side] = {'parts': parts, 'light': light, 'shade': shade}
    return coll, furniture, lamps


# ------------------------------------------------------------- the void

def build_void(furniture):
    coll = collection('HB_Void')
    mirror = principled('HB_MirrorFloor', (0.006, 0.007, 0.01), rough=0.04)
    box('MirrorFloor', (900, 900, 0.1), VOID + Vector((0, 0, -0.05)), mirror, coll)

    # Skyline: dark towers with lit windows, in white and blue.
    tower_mat, nodes, links = new_material('HB_Tower')
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    set_input(bsdf, 'Base Color', (0.004, 0.005, 0.008, 1))
    set_input(bsdf, 'Roughness', 0.3)
    coord = nodes.new('ShaderNodeTexCoord')
    brick = nodes.new('ShaderNodeTexBrick')
    # Windows ~1.3m wide; Bias randomly leaves some dark.
    set_input(brick, 'Scale', 0.3)
    set_input(brick, 'Mortar Size', 0.08)
    set_input(brick, 'Brick Width', 0.55)
    set_input(brick, 'Row Height', 0.3)
    set_input(brick, 'Bias', 0.6)  # higher = fewer lit windows
    set_input(brick, 'Color1', (1, 1, 1, 1))
    set_input(brick, 'Color2', (0.02, 0.02, 0.02, 1))
    set_input(brick, 'Mortar', (0, 0, 0, 1))
    info = nodes.new('ShaderNodeObjectInfo')
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*NEON_BLUE, 1)
    ramp.color_ramp.elements[1].color = (*NEON_WHITE, 1)
    mul = nodes.new('ShaderNodeMixRGB')
    mul.blend_type = 'MULTIPLY'
    mul.inputs[0].default_value = 1.0
    # Brick is a 2D texture: map (around the wall, height) so windows sit on facades.
    sep = nodes.new('ShaderNodeSeparateXYZ')
    around = nodes.new('ShaderNodeMath')
    around.operation = 'ADD'
    comb = nodes.new('ShaderNodeCombineXYZ')
    links.new(coord.outputs['Object'], sep.inputs[0])
    links.new(sep.outputs['X'], around.inputs[0])
    links.new(sep.outputs['Y'], around.inputs[1])
    links.new(around.outputs[0], comb.inputs['X'])
    links.new(sep.outputs['Z'], comb.inputs['Y'])
    links.new(comb.outputs[0], brick.inputs['Vector'])
    links.new(info.outputs['Random'], ramp.inputs['Fac'])
    links.new(brick.outputs['Color'], mul.inputs[1])
    links.new(ramp.outputs['Color'], mul.inputs[2])
    links.new(mul.outputs['Color'], bsdf.inputs['Emission Color'])
    set_input(bsdf, 'Emission Strength', 3.0)
    links.new(bsdf.outputs[0], out.inputs['Surface'])

    # A ring of towers on the horizon, leaving black sky above.
    for i in range(140):
        ang = rng.uniform(0, math.tau)
        dist = rng.uniform(110, 300)
        w = rng.uniform(8, 22)
        d = rng.uniform(8, 22)
        h = rng.uniform(10, 34) * (dist / 150)
        pos = VOID + Vector((math.cos(ang) * dist, math.sin(ang) * dist, h / 2))
        ob = box(f'Tower_{i:03d}', (w, d, h), pos, tower_mat, coll)
        ob.rotation_euler.z = rng.uniform(0, math.pi)

    # Neon spires on the skyline.
    for i in range(14):
        ang = rng.uniform(0, math.tau)
        dist = rng.uniform(130, 280)
        h = rng.uniform(70, 150)
        color = NEON_BLUE if i % 2 else NEON_WHITE
        pos = VOID + Vector((math.cos(ang) * dist, math.sin(ang) * dist, h / 2))
        cone(f'Spire_{i:02d}', 0.35, 0.35, h, pos, emission(f'HB_Spire_{i}', color, 8.0), coll, segments=8)

    # Floating mirror shards.
    shard_mat = emission('HB_Shard', NEON_WHITE, 6.0)
    shards = []
    for i in range(46):
        pos = VOID + Vector((rng.uniform(-6, 8), rng.uniform(-4, 9), rng.uniform(1.0, 7.5)))
        ob = sphere(f'Shard_{i:02d}', rng.uniform(0.03, 0.09), pos, shard_mat, coll, subdiv=0)
        ob.scale = (1.0, 0.25, 1.8)
        ob.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))
        shards.append(ob)

    # Neon ghost of the room, mirrored left-to-right: the world you came from.
    ghost_mat = emission('HB_Ghost', NEON_WHITE, 2.5)
    ghost_lamp_mat = emission('HB_GhostLamp', COLD, 9.0)
    ghost_lamp = []
    for src in furniture:
        if src.name.startswith(('Rug', 'Art_', 'TV_Screen')):
            continue
        ob = src.copy()
        ob.data = src.data.copy()
        ob.data.materials.clear()
        is_strange = src.name.startswith('Lamp_strange')
        ob.data.materials.append(ghost_lamp_mat if is_strange and 'Shade' in src.name else ghost_mat)
        ob.location = VOID + Vector((-src.location.x, src.location.y, src.location.z))
        ob.scale.x *= -1
        if not (is_strange and 'Shade' in src.name):
            wire = ob.modifiers.new('Wire', 'WIREFRAME')
            wire.thickness = 0.008
        coll.objects.link(ob)
        if is_strange:
            ghost_lamp.append(ob)
    return coll, shards, ghost_lamp_mat


# --------------------------------------------------------- camera + body

def build_rig():
    coll = collection('HB_Rig')
    cam_data = bpy.data.cameras.new('POV')
    cam_data.lens = 24
    cam_data.clip_start = 0.01
    cam_data.clip_end = 1000
    cam = bpy.data.objects.new('POV', cam_data)
    coll.objects.link(cam)
    bpy.context.scene.camera = cam

    # Hand + forearm, parented to the camera (camera space: -Z forward, +Y up).
    skin = principled('HB_Skin', (0.62, 0.42, 0.32), rough=0.5, sss=0.15)
    sleeve = principled('HB_Sleeve', (0.05, 0.05, 0.06), rough=0.9)
    hand = bpy.data.objects.new('Hand', None)
    hand.parent = cam
    coll.objects.link(hand)

    def part(ob):
        ob.parent = hand
        return ob

    part(box('Palm', (0.085, 0.026, 0.1), (0, 0, -0.05), skin, coll, bevel=0.01))
    # Index finger points at the lamp; the others curl down from the knuckle.
    for i, (x, length, curl) in enumerate([(-0.03, 0.09, 0.0), (-0.01, 0.095, 0.2), (0.012, 0.09, 0.3), (0.032, 0.075, 0.4)]):
        f = part(cone(f'Finger_{i}', 0.0095, 0.008, length, (x, 0, -0.1), skin, coll, segments=12, pivot_end=True))
        f.rotation_euler.x = -curl  # negative bends toward the palm (down)
    thumb = part(cone('Thumb', 0.011, 0.009, 0.07, (-0.05, 0.005, -0.045), skin, coll, segments=12))
    thumb.rotation_euler = (math.radians(-20), math.radians(-35), 0)
    fore_dir = Vector((0.16, -0.28, 0.42)).normalized()
    forearm = part(cone('Forearm', 0.032, 0.04, 0.5, fore_dir * 0.25, skin, coll, segments=16))
    forearm.rotation_euler = fore_dir.to_track_quat('Z', 'Y').to_euler()
    cuff = part(cone('Sleeve', 0.05, 0.055, 0.3, fore_dir * 0.55, sleeve, coll, segments=16))
    cuff.rotation_euler = forearm.rotation_euler

    # Eyelids for the blackout and the wake-up blink.
    lid_mat = emission('HB_Lid', (0, 0, 0), 0.0)
    lids = []
    for sign in (1, -1):
        lid = box(f'Eyelid_{"top" if sign > 0 else "bottom"}', (0.12, 0.05, 0.001), (0, 0, -0.03), lid_mat, coll)
        lid.parent = cam
        lids.append((lid, sign))

    # Whiteout card.
    white_mat, white_mix = fade_material('HB_White', (1, 1, 1), 30.0)
    white = box('Whiteout', (0.12, 0.08, 0.001), (0, 0, -0.035), white_mat, coll)
    white.parent = cam

    subtitle = None
    if SUBTITLES:
        curve = bpy.data.curves.new('Subtitle', 'FONT')
        curve.body = '"No, don\'t!"'
        curve.align_x = 'CENTER'
        curve.size = 0.0025
        subtitle = bpy.data.objects.new('Subtitle', curve)
        subtitle.data.materials.append(emission('HB_SubtitleMat', (1, 1, 1), 1.2))
        subtitle.parent = cam
        subtitle.location = (0, -0.0165, -0.05)  # just past the lens: nothing can occlude it
        coll.objects.link(subtitle)
    return cam, hand, lids, white_mix, subtitle


# --------------------------------------------------------------- animation

def animate_camera(cam):
    shake = (Wobble(), Wobble(), Wobble())
    seat_h, seat_p = heading_pitch(SEAT_EYE, WINDOW_LOOK)
    lamp_h, lamp_p = heading_pitch(SEAT_EYE, SHADE_CENTER)
    stand_h, stand_p = heading_pitch(STAND_EYE, SHADE_CENTER)
    near_h, near_p = heading_pitch(NEAR_EYE, SHADE_CENTER)
    lean_h, lean_p = heading_pitch(LEAN_EYE, SHADE_CENTER)

    wake = VOID + Vector((1.0, 1.6, 0.25))
    risen = VOID + Vector((1.0, 1.5, 1.6))
    ghost_shade = VOID + Vector((-SHADE_CENTER.x, SHADE_CENTER.y, SHADE_CENTER.z))
    wake_h, _ = heading_pitch(wake, ghost_shade)
    rise_h, rise_p = heading_pitch(risen, ghost_shade)
    flashes = {F(B('touch') + d) for d in (0.35, 0.65, 0.7, 0.9)}  # 1-frame peeks into the void

    for frame in range(1, F(B('end')) + 1):
        t = (frame - 1) / FPS
        roll = 0.0
        if t < B('black'):
            # --- living room
            k_turn = span(t, B('turn'), B('turn') + 1.1)
            k_stand = span(t, B('stand'), B('walk'))
            k_walk = span(t, B('walk'), B('reach'))
            k_lean = span(t, B('reach'), B('touch'))
            pos = SEAT_EYE.lerp(STAND_EYE, k_stand).lerp(NEAR_EYE, k_walk).lerp(LEAN_EYE, k_lean)
            h = seat_h + (lamp_h - seat_h) * k_turn
            p = seat_p + (lamp_p - seat_p) * k_turn
            h += (stand_h - lamp_h) * k_stand + (near_h - stand_h) * k_walk + (lean_h - near_h) * k_lean
            p += (stand_p - lamp_p) * k_stand + (near_p - stand_p) * k_walk + (lean_p - near_p) * k_lean
            # Breathing while seated, footsteps while walking.
            pos.z += 0.006 * math.sin(t * 1.6) * (1 - k_stand)
            walking = k_walk * (1 - k_walk) * 4
            pos.z += 0.022 * math.sin(t * math.tau * 1.7) * walking
            pos += Vector((0.012 * math.sin(t * math.pi * 1.7), 0, 0)) * walking
            roll += 0.012 * math.sin(t * math.pi * 1.7) * walking
            # Flinch at the voice: a half-turn toward it, cut short by the touch.
            flinch = span(t, B('voice') + 0.12, B('touch'))
            h -= 0.18 * flinch
            # Handheld drift.
            amt = 0.006
            p += shake[0](t) * amt
            h += shake[1](t) * amt
            roll += shake[2](t) * amt * 0.6
            if t >= B('touch'):  # the glitch: violent per-frame jolts
                g = 1 - span(t, B('whiteout'), B('black'))
                pos += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.03 * g
                h += rng.uniform(-1, 1) * 0.06 * g
                p += rng.uniform(-1, 1) * 0.05 * g
                roll += rng.uniform(-1, 1) * 0.15 * g
            if frame in flashes:
                pos = VOID + Vector((rng.uniform(-3, 3), rng.uniform(-3, 3), 1.6))
                h, p = rng.uniform(0, math.tau), rng.uniform(-0.05, 0.25)
        else:
            # --- the void
            k_rise = span(t, B('rise'), B('rise') + 1.6)
            k_back = span(t, B('turnback'), B('turnback') + 2.2)
            pos = wake.lerp(risen, k_rise) + Vector((0, -0.2, 0.02)) * k_back
            h = wake_h + (rise_h - wake_h) * k_rise + math.pi * 0.92 * k_back
            p = math.radians(62) + (rise_p - math.radians(62)) * k_rise + (math.radians(7) - rise_p) * k_back
            roll = math.radians(-14) * (1 - k_rise)  # head tilted on the floor
            pos.z += 0.008 * math.sin(t * 1.3) * k_rise
            h += shake[1](t) * 0.004
            p += shake[0](t) * 0.004

        cam.location = pos
        cam.rotation_euler = cam_euler(h, p, roll)
        cam.keyframe_insert('location', frame=frame)
        cam.keyframe_insert('rotation_euler', frame=frame)


def animate_hand(hand):
    hidden = Vector((0.22, -0.5, -0.15))
    reach = Vector((0.04, -0.075, -0.56))
    tremble = (Wobble(), Wobble())
    for frame in range(1, F(B('black')) + 2):
        t = (frame - 1) / FPS
        k = span(t, B('reach'), B('touch'))
        pos = hidden.lerp(reach, k)
        pos += Vector((tremble[0](t * 3), tremble[1](t * 3), 0)) * 0.004 * k
        if t > B('voice'):  # hesitation at the shout, but still drifting in
            pos.z += 0.03 * span(t, B('voice'), B('voice') + 0.15) * (1 - span(t, B('voice') + 0.15, B('touch')))
        if t >= B('touch'):
            pos += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * 0.01
        hand.location = pos
        # Tilt up toward the lamp at the centre of frame as the arm extends.
        hand.rotation_euler = (math.radians(18) * k, 0, math.radians(-6))
        hand.keyframe_insert('location', frame=frame)
        hand.keyframe_insert('rotation_euler', frame=frame)
        visible = 0.001 if t >= B('black') else 1.0
        hand.scale = (visible,) * 3
        hand.keyframe_insert('scale', frame=frame)


def flicker_level(t):
    """Brightness of the strange lamp over time (1 = normal)."""
    def burst(start, length, depth):
        if start <= t < start + length:
            phase = (t - start) * 37.0
            return 1 - depth * (0.5 + 0.5 * math.sin(phase * 2.3) * math.sin(phase * 0.7 + 1.3))
        return 1.0

    level = burst(B('flicker1'), 0.25, 0.9) * burst(B('flicker2'), 0.4, 0.8)
    if t >= B('reach'):  # restless as you approach, steadily worse
        k = span(t, B('reach'), B('touch'))
        level *= 1 - 0.6 * k * (0.5 + 0.5 * math.sin(t * 41) * math.sin(t * 13.7))
        level *= 1 + 0.5 * k
    return max(0.05, level)


def animate_lamps(lamps, ghost_lamp_mat):
    strange, plain = lamps['strange'], lamps['plain']
    s_light, p_light = strange['light'].data, plain['light'].data
    s_bsdf = next(n for n in strange['shade'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p_bsdf = next(n for n in plain['shade'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for frame in range(1, F(B('black')) + 2):
        t = (frame - 1) / FPS
        lvl = flicker_level(t)
        cold = span(t, B('reach') + 0.5, B('touch'))  # warms -> cold neon blue
        color = tuple(w + (c - w) * cold for w, c in zip(WARM, COLD))
        plain_lvl = 1.0
        if t >= B('touch'):  # glitch: blinding pulses, the other lamp dies
            g = rng.random()
            lvl = 12.0 if g > 0.55 else rng.uniform(0.0, 2.0)
            color = NEON_WHITE if g > 0.8 else NEON_BLUE
            plain_lvl = rng.choice((0.0, 0.0, 1.0))
        s_light.energy = 35.0 * lvl
        s_light.color = color
        s_light.keyframe_insert('energy', frame=frame)
        s_light.keyframe_insert('color', frame=frame)
        key_socket(s_bsdf.inputs['Emission Strength'], frame, SHADE_GLOW * lvl)
        key_socket(s_bsdf.inputs['Emission Color'], frame, (*color, 1))
        p_light.energy = 35.0 * plain_lvl
        p_light.keyframe_insert('energy', frame=frame)
        key_socket(p_bsdf.inputs['Emission Strength'], frame, SHADE_GLOW * plain_lvl)
    for idblock in (s_light, p_light, strange['shade'].node_tree, plain['shade'].node_tree):
        snap(idblock)  # crisp flicker: no easing between frames

    # The ghost lamp in the void pulses gently.
    em = next(n for n in ghost_lamp_mat.node_tree.nodes if n.type == 'EMISSION')
    for frame in range(F(B('black')), F(B('end')) + 1, 6):
        t = (frame - 1) / FPS
        key_socket(em.inputs['Strength'], frame, 7.0 + 3.0 * math.sin(t * 2.4))


def animate_room_glitch(furniture):
    """Furniture tears sideways in hard per-frame jumps during the glitch."""
    start, end = F(B('touch')), F(B('black'))
    victims = [ob for ob in furniture if not ob.name.startswith(('Rug', 'Lamp_strange'))]
    for ob in victims:
        home = ob.location.copy()
        ob.keyframe_insert('location', frame=start - 1)
        for frame in range(start, end, 2):
            strength = 0.04 + 0.25 * (frame - start) / (end - start)
            if rng.random() < 0.45:
                ob.location = home + Vector((rng.uniform(-1, 1) * strength, 0, rng.uniform(-0.3, 0.3) * strength))
            else:
                ob.location = home
            ob.keyframe_insert('location', frame=frame)
        ob.location = home
        ob.keyframe_insert('location', frame=end)
        snap(ob, 'location')


def animate_overlays(lids, white_mix, subtitle, lens):
    def lid_open(t):
        """1 = eyes open, 0 = shut."""
        if t < B('black'):
            return 1.0
        w = B('wake')
        if t < w:
            return 0.0
        if t < w + 0.6:
            return 0.35 * span(t, w, w + 0.6)
        if t < w + 0.85:
            return 0.35 * (1 - span(t, w + 0.6, w + 0.75))
        return span(t, w + 0.85, w + 1.8)

    for frame in range(1, F(B('end')) + 1):
        t = (frame - 1) / FPS
        o = lid_open(t)
        for lid, sign in lids:
            lid.location.y = sign * (0.025 + 0.03 * o)
            lid.keyframe_insert('location', frame=frame)

    fac = white_mix.inputs[0]
    key_socket(fac, F(B('whiteout')) - 1, 0.0)
    key_socket(fac, F(B('black')) - 1, 1.0)
    key_socket(fac, F(B('black')) + 1, 0.0)

    if subtitle:
        subtitle.scale = (0, 0, 0)
        subtitle.keyframe_insert('scale', frame=1)
        subtitle.scale = (1, 1, 1)
        subtitle.keyframe_insert('scale', frame=F(B('voice')))
        subtitle.scale = (0, 0, 0)
        subtitle.keyframe_insert('scale', frame=F(B('voice') + 1.0))
        snap(subtitle, 'scale')

    if lens:  # chromatic aberration ramps up through the glitch
        disp = lens.inputs['Dispersion']
        key_socket(disp, 1, 0.0)
        for frame in range(F(B('touch')), F(B('black')), 2):
            k = (frame - F(B('touch'))) / (F(B('black')) - F(B('touch')))
            key_socket(disp, frame, rng.uniform(0.02, 0.12) + 0.2 * k)
        key_socket(disp, F(B('black')), 0.0)
        snap(lens.id_data)


def animate_shards(shards):
    end = F(B('end'))
    for ob in shards:
        start_rot = ob.rotation_euler.copy()
        start_loc = ob.location.copy()
        ob.keyframe_insert('rotation_euler', frame=1)
        ob.keyframe_insert('location', frame=1)
        ob.rotation_euler = (start_rot.x + rng.uniform(-2, 2), start_rot.y + rng.uniform(-2, 2), start_rot.z + rng.uniform(-3, 3))
        ob.location = start_loc + Vector((0, 0, rng.uniform(0.2, 0.8)))
        ob.keyframe_insert('rotation_euler', frame=end)
        ob.keyframe_insert('location', frame=end)


def add_audio_and_markers(scene):
    for name, sec in BEATS.items():
        scene.timeline_markers.new(name, frame=F(sec))
    if VOICE_FILE and os.path.exists(VOICE_FILE):
        editor = scene.sequence_editor or scene.sequence_editor_create()
        strips = editor.strips if hasattr(editor, 'strips') else editor.sequences
        strips.new_sound('VO_NoDont', VOICE_FILE, channel=1, frame_start=F(B('voice')))


def configure_output(scene):
    base = os.path.dirname(bpy.data.filepath) if bpy.data.filepath else (
        os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() and os.path.exists(__file__) else bpy.app.tempdir)
    scene.render.filepath = os.path.join(base, 'renders', 'hull_bracers_intro_')
    img = scene.render.image_settings
    try:
        if hasattr(img, 'media_type'):
            img.media_type = 'VIDEO'
        img.file_format = 'FFMPEG'
        ff = scene.render.ffmpeg
        ff.format = 'MPEG4'
        ff.codec = 'H264'
        ff.constant_rate_factor = 'HIGH'
        ff.audio_codec = 'AAC' if VOICE_FILE else 'NONE'
    except Exception as exc:
        print(f'[intro] video output unavailable ({exc}); rendering PNG frames instead')
        if hasattr(img, 'media_type'):
            img.media_type = 'IMAGE'
        img.file_format = 'PNG'


def frame_view():
    """In the UI, look through the POV camera."""
    for area in getattr(bpy.context.screen, 'areas', []):
        if area.type == 'VIEW_3D':
            area.spaces[0].region_3d.view_perspective = 'CAMERA'


# -------------------------------------------------------------------- main

def build():
    clear_scene()
    scene = setup_scene()
    setup_world(scene)
    lens = setup_compositor(scene)
    _, furniture, lamps = build_room()
    _, shards, ghost_lamp_mat = build_void(furniture)
    cam, hand, lids, white_mix, subtitle = build_rig()
    animate_camera(cam)
    animate_hand(hand)
    animate_lamps(lamps, ghost_lamp_mat)
    animate_room_glitch(furniture)
    animate_overlays(lids, white_mix, subtitle, lens)
    animate_shards(shards)
    add_audio_and_markers(scene)
    configure_output(scene)
    scene.frame_set(1)
    try:
        frame_view()
    except Exception:
        pass
    print(f'[intro] built {scene.frame_end} frames at {FPS} fps ({B("end"):.1f}s), engine {scene.render.engine}')
    print(f'[intro] output: {scene.render.filepath}')
    return scene


if __name__ == '__main__':
    scene = build()
    if '--save' in ARGS:
        here = os.path.dirname(os.path.abspath(__file__))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(here, 'intro_lamp.blend'))
    if '--render' in ARGS:
        bpy.ops.render.render(animation=True)
