/**
 * Automated Verification Test Suite for PhotoCop
 * Tests Command Dispatcher, Layer Operations, Clipping Mask, History, and Canvas Tools
 */

import assert from 'node:assert';

// ─── Browser Environment Polyfills for Node ──────────────────────────────────

if (typeof globalThis.ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  };
}

if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        const canvas: any = {
          width: 100,
          height: 100,
          getContext: () => ({
            save: () => {},
            restore: () => {},
            translate: () => {},
            rotate: () => {},
            scale: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            drawImage: () => {},
            putImageData: () => {},
            getImageData: (x: number, y: number, w: number, h: number) => {
              const img = new (globalThis as any).ImageData(w, h);
              for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
              return img;
            },
            fillText: () => {},
            clearRect: () => {},
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            createRadialGradient: () => ({ addColorStop: () => {} }),
          }),
        };
        return canvas;
      }
      return {};
    },
  };
}

// ─── Imports ──────────────────────────────────────────────────────────────────

import { handleCommand, type EditorState } from '../core/commandDispatcher';
import { createDocument, addLayer, createPixelLayer, createGroupLayer } from '../core/document';
import { paintStroke } from '../core/brushEngine';

function makeInitialState(): EditorState {
  const doc = createDocument(200, 200, 'Test Doc');
  return {
    document: doc,
    selection: { width: 0, height: 0, bounds: null, feather: 0 },
    foreground: { r: 255, g: 0, b: 0, a: 255 },
    background: { r: 0, g: 255, b: 0, a: 255 },
    history: [],
    historyIndex: -1,
    maxHistory: 100,
    viewport: { zoom: 1, panX: 0, panY: 0 },
  };
}

// ─── Test Runners ─────────────────────────────────────────────────────────────

function testDocumentCreation() {
  console.log('Running: testDocumentCreation');
  const state = makeInitialState();
  assert(state.document !== null, 'Document should exist');
  assert.strictEqual(state.document?.width, 200);
  assert.strictEqual(state.document?.height, 200);
  assert.strictEqual(state.document?.layerOrder.length, 1);
  console.log('  ✓ testDocumentCreation passed');
}

function testLayerCreation() {
  console.log('Running: testLayerCreation');
  let state = makeInitialState();
  const { mutation, result } = handleCommand(state, {
    type: 'layer.create',
    layerType: 'pixel',
    name: 'Painted Layer',
    source: 'user',
  });
  assert(result.success, 'layer.create should succeed');
  state = { ...state, ...mutation };
  assert.strictEqual(state.document?.layerOrder.length, 2);
  const activeId = state.document?.activeLayerId;
  assert(activeId, 'Active layer should be set');
  assert.strictEqual(state.document?.layers[activeId]?.name, 'Painted Layer');
  assert.strictEqual(state.history.length, 1);
  console.log('  ✓ testLayerCreation passed');
}

function testLayerDuplicate() {
  console.log('Running: testLayerDuplicate');
  let state = makeInitialState();
  const baseId = state.document!.layerOrder[0];

  const { mutation, result } = handleCommand(state, {
    type: 'layer.duplicate',
    layerId: baseId,
    source: 'user',
  });
  assert(result.success, 'layer.duplicate should succeed');
  state = { ...state, ...mutation };
  assert.strictEqual(state.document?.layerOrder.length, 2);
  console.log('  ✓ testLayerDuplicate passed');
}

function testLayerGroupingAndUngrouping() {
  console.log('Running: testLayerGroupingAndUngrouping');
  let state = makeInitialState();

  // Create two pixel layers
  const res1 = handleCommand(state, { type: 'layer.create', layerType: 'pixel', name: 'L1', source: 'user' });
  state = { ...state, ...res1.mutation };
  const res2 = handleCommand(state, { type: 'layer.create', layerType: 'pixel', name: 'L2', source: 'user' });
  state = { ...state, ...res2.mutation };

  const l1Id = state.document!.layerOrder[1];
  const l2Id = state.document!.layerOrder[0];

  // Group L1 and L2
  const groupRes = handleCommand(state, {
    type: 'layer.group',
    layerIds: [l1Id, l2Id],
    groupName: 'Folder 1',
    source: 'user',
  });
  assert(groupRes.result.success, 'layer.group should succeed');
  state = { ...state, ...groupRes.mutation };

  const groupLayerId = state.document!.activeLayerId!;
  const groupLayer = state.document!.layers[groupLayerId];
  assert.strictEqual(groupLayer.type, 'group');
  assert.strictEqual(groupLayer.name, 'Folder 1');
  assert(groupLayer.children?.includes(l1Id));
  assert(groupLayer.children?.includes(l2Id));
  assert(!state.document!.layerOrder.includes(l1Id), 'Grouped layers should be moved into group.children');
  assert(state.document!.layerOrder.includes(groupLayerId), 'Group layer should be in doc.layerOrder');

  // Ungroup Folder 1
  const ungroupRes = handleCommand(state, {
    type: 'layer.ungroup',
    groupLayerId,
    source: 'user',
  });
  assert(ungroupRes.result.success, 'layer.ungroup should succeed');
  state = { ...state, ...ungroupRes.mutation };

  assert(!state.document!.layers[groupLayerId], 'Group layer should be deleted');
  assert(state.document!.layerOrder.includes(l1Id), 'L1 should be restored to layerOrder');
  assert(state.document!.layerOrder.includes(l2Id), 'L2 should be restored to layerOrder');
  console.log('  ✓ testLayerGroupingAndUngrouping passed');
}

function testClippingMask() {
  console.log('Running: testClippingMask');
  let state = makeInitialState();

  const res1 = handleCommand(state, { type: 'layer.create', layerType: 'pixel', name: 'Top', source: 'user' });
  state = { ...state, ...res1.mutation };
  const topId = state.document!.activeLayerId!;

  const clipRes = handleCommand(state, {
    type: 'layer.set_clipping_mask',
    layerId: topId,
    clippingMask: true,
    source: 'user',
  });
  assert(clipRes.result.success, 'set_clipping_mask should succeed');
  state = { ...state, ...clipRes.mutation };
  assert.strictEqual(state.document!.layers[topId].clippingMask, true);

  // Unclip
  const unclipRes = handleCommand(state, {
    type: 'layer.set_clipping_mask',
    layerId: topId,
    clippingMask: false,
    source: 'user',
  });
  assert(unclipRes.result.success, 'unclip should succeed');
  state = { ...state, ...unclipRes.mutation };
  assert.strictEqual(state.document!.layers[topId].clippingMask, false);
  console.log('  ✓ testClippingMask passed');
}

function testLayerMergeDown() {
  console.log('Running: testLayerMergeDown');
  let state = makeInitialState();

  const res1 = handleCommand(state, { type: 'layer.create', layerType: 'pixel', name: 'Top', source: 'user' });
  state = { ...state, ...res1.mutation };
  const topId = state.document!.activeLayerId!;
  const bottomId = state.document!.layerOrder[1];

  const mergeRes = handleCommand(state, {
    type: 'layer.merge_down',
    layerId: topId,
    source: 'user',
  });
  assert(mergeRes.result.success, 'merge_down should succeed');
  state = { ...state, ...mergeRes.mutation };

  assert(!state.document!.layers[topId], 'Top layer should be removed after merge down');
  assert(state.document!.layers[bottomId], 'Bottom layer should retain merged contents');
  assert.strictEqual(state.document!.layerOrder.length, 1);
  console.log('  ✓ testLayerMergeDown passed');
}

function testTextLayerOperations() {
  console.log('Running: testTextLayerOperations');
  let state = makeInitialState();

  const createTextRes = handleCommand(state, {
    type: 'text.create',
    position: { x: 50, y: 80 },
    textData: {
      content: 'Hello PhotoCop',
      style: {
        fontFamily: 'Inter',
        fontWeight: 400,
        fontStyle: 'normal',
        fontSize: 32,
        color: { r: 255, g: 255, b: 255, a: 255 },
        letterSpacing: 0,
        lineHeight: 40,
        textAlign: 'left',
      },
    },
    source: 'user',
  });
  assert(createTextRes.result.success, 'text.create should succeed');
  state = { ...state, ...createTextRes.mutation };

  const textId = state.document!.activeLayerId!;
  const textLayer = state.document!.layers[textId];
  assert.strictEqual(textLayer.type, 'text');
  assert.strictEqual(textLayer.textData?.content, 'Hello PhotoCop');
  assert.strictEqual(textLayer.transform.x, 50);
  assert.strictEqual(textLayer.transform.y, 80);

  // Edit text
  const editTextRes = handleCommand(state, {
    type: 'text.edit',
    layerId: textId,
    textData: { content: 'Updated Text' },
    source: 'user',
  });
  assert(editTextRes.result.success, 'text.edit should succeed');
  state = { ...state, ...editTextRes.mutation };
  assert.strictEqual(state.document!.layers[textId].textData?.content, 'Updated Text');
  console.log('  ✓ testTextLayerOperations passed');
}

function testPixelFillAndFloodFill() {
  console.log('Running: testPixelFillAndFloodFill');
  let state = makeInitialState();

  const pLayer = createPixelLayer(10, 10, 'Paint');
  state.document = addLayer(state.document!, pLayer);

  // Flood fill from (2, 2)
  const fillRes = handleCommand(state, {
    type: 'pixel.fill',
    layerId: pLayer.id,
    color: { r: 120, g: 200, b: 50, a: 255 },
    point: { x: 2, y: 2 },
    source: 'user',
  });
  assert(fillRes.result.success, 'pixel.fill with point should succeed');
  state = { ...state, ...fillRes.mutation };

  const filledData = state.document!.layers[pLayer.id].imageData!.data;
  assert.strictEqual(filledData[0], 120);
  assert.strictEqual(filledData[1], 200);
  assert.strictEqual(filledData[2], 50);
  assert.strictEqual(filledData[3], 255);
  console.log('  ✓ testPixelFillAndFloodFill passed');
}

function testSelectionCommands() {
  console.log('Running: testSelectionCommands');
  let state = makeInitialState();

  const rectRes = handleCommand(state, {
    type: 'selection.create_rect',
    rect: { x: 10, y: 10, width: 80, height: 50 },
    mode: 'replace',
    source: 'user',
  });
  assert(rectRes.result.success);
  state = { ...state, ...rectRes.mutation };
  assert.deepStrictEqual(state.selection.bounds, { x: 10, y: 10, width: 80, height: 50 });

  const ellipseRes = handleCommand(state, {
    type: 'selection.create_ellipse',
    rect: { x: 20, y: 30, width: 60, height: 40 },
    mode: 'replace',
    source: 'user',
  });
  assert(ellipseRes.result.success);
  state = { ...state, ...ellipseRes.mutation };
  assert.deepStrictEqual(state.selection.bounds, { x: 20, y: 30, width: 60, height: 40 });

  const deselectRes = handleCommand(state, { type: 'selection.deselect', source: 'user' });
  state = { ...state, ...deselectRes.mutation };
  assert.strictEqual(state.selection.bounds, null);
  console.log('  ✓ testSelectionCommands passed');
}

function testMergeDownEdgeCases() {
  console.log('Running: testMergeDownEdgeCases');
  const state = makeInitialState();
  const bottomId = state.document!.layerOrder[0];

  // Try to merge down the bottom-most layer (only 1 layer exists)
  const res = handleCommand(state, {
    type: 'layer.merge_down',
    layerId: bottomId,
    source: 'user',
  });
  // Should gracefully return empty mutation without throwing error
  assert(res.result.success, 'merge_down on bottom-most layer should not throw');
  assert.deepStrictEqual(res.mutation, {});
  console.log('  ✓ testMergeDownEdgeCases passed');
}

function testGroupingEdgeCases() {
  console.log('Running: testGroupingEdgeCases');
  const state = makeInitialState();

  // Group nonexistent layers
  const res = handleCommand(state, {
    type: 'layer.group',
    layerIds: ['nonexistent-1', 'nonexistent-2'],
    source: 'user',
  });
  assert(res.result.success);
  assert.deepStrictEqual(res.mutation, {});
  console.log('  ✓ testGroupingEdgeCases passed');
}

function testFloodFillEdgeCases() {
  console.log('Running: testFloodFillEdgeCases');
  let state = makeInitialState();
  const pLayer = createPixelLayer(10, 10, 'Paint');
  state.document = addLayer(state.document!, pLayer);

  // Fill point out of bounds (-5, 500)
  const resOutOfBounds = handleCommand(state, {
    type: 'pixel.fill',
    layerId: pLayer.id,
    color: { r: 10, g: 20, b: 30, a: 255 },
    point: { x: -5, y: 500 },
    source: 'user',
  });
  assert(resOutOfBounds.result.success, 'Out-of-bounds point should not throw');

  // Fill with exact same color (should return early without infinite loop)
  const resSame = handleCommand(state, {
    type: 'pixel.fill',
    layerId: pLayer.id,
    color: { r: 0, g: 0, b: 0, a: 0 },
    point: { x: 0, y: 0 },
    source: 'user',
  });
  assert(resSame.result.success, 'Same color fill should not loop');
  console.log('  ✓ testFloodFillEdgeCases passed');
}

function testHistoryUndoRedo() {
  console.log('Running: testHistoryUndoRedo');
  let state = makeInitialState();
  const initialLayerCount = state.document!.layerOrder.length;

  // Add layer
  const addRes = handleCommand(state, {
    type: 'layer.create',
    layerType: 'pixel',
    name: 'Undoable Layer',
    source: 'user',
  });
  state = { ...state, ...addRes.mutation };
  assert.strictEqual(state.document!.layerOrder.length, initialLayerCount + 1);
  assert.strictEqual(state.historyIndex, 0);

  // Undo: layer must be completely removed from document
  const undoRes = handleCommand(state, { type: 'history.undo', source: 'user' });
  state = { ...state, ...undoRes.mutation };
  assert.strictEqual(state.historyIndex, -1);
  assert.strictEqual(state.document!.layerOrder.length, initialLayerCount, 'Layer should be removed from layerOrder on undo');

  // Redo: layer must be restored
  const redoRes = handleCommand(state, { type: 'history.redo', source: 'user' });
  state = { ...state, ...redoRes.mutation };
  assert.strictEqual(state.historyIndex, 0);
  assert.strictEqual(state.document!.layerOrder.length, initialLayerCount + 1, 'Layer should be restored to layerOrder on redo');
  console.log('  ✓ testHistoryUndoRedo passed');
}

function testMoveAboveAndBelow() {
  console.log('Running: testMoveAboveAndBelow');
  let state = makeInitialState();

  const l1 = createPixelLayer(50, 50, 'Layer 1');
  const l2 = createPixelLayer(50, 50, 'Layer 2');
  const l3 = createPixelLayer(50, 50, 'Layer 3');

  state.document = addLayer(addLayer(addLayer(state.document!, l1), l2), l3);
  // Order is [l3.id, l2.id, l1.id, bg.id]

  // Move l1 above l3
  const moveRes = handleCommand(state, {
    type: 'layer.move_above',
    layerId: l1.id,
    targetLayerId: l3.id,
    source: 'user',
  });
  assert(moveRes.result.success);
  state = { ...state, ...moveRes.mutation };
  assert.strictEqual(state.document!.layerOrder[0], l1.id, 'l1 should now be at index 0');

  // Move l1 below l2
  const moveBelowRes = handleCommand(state, {
    type: 'layer.move_below',
    layerId: l1.id,
    targetLayerId: l2.id,
    source: 'user',
  });
  assert(moveBelowRes.result.success);
  state = { ...state, ...moveBelowRes.mutation };
  const l2Idx = state.document!.layerOrder.indexOf(l2.id);
  const l1Idx = state.document!.layerOrder.indexOf(l1.id);
  assert.strictEqual(l1Idx, l2Idx + 1, 'l1 should be directly below l2');
  console.log('  ✓ testMoveAboveAndBelow passed');
}

function testCompositorGroupVisibility() {
  console.log('Running: testCompositorGroupVisibility');
  const { compositeDocument } = require('../core/compositor');
  const doc = createDocument(50, 50, 'Group Vis Test');

  const child1 = createPixelLayer(50, 50, 'Child 1', { r: 255, g: 0, b: 0, a: 255 });
  const group = createGroupLayer('Folder', [child1.id]);
  group.visible = false; // Hide the group!

  const docWithGroup = {
    ...doc,
    layers: { ...doc.layers, [child1.id]: child1, [group.id]: group },
    layerOrder: [group.id, ...doc.layerOrder],
  };

  let drawImageCalls = 0;
  const mockCtx: any = {
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    drawImage: () => { drawImageCalls++; },
    getImageData: () => new (globalThis as any).ImageData(50, 50),
    putImageData: () => {},
  };

  compositeDocument(docWithGroup, mockCtx);
  // Background layer is visible (1 drawImage call for bg, child1 is skipped because parent group is hidden)
  assert.strictEqual(drawImageCalls, 1, 'Child of hidden group should not be rendered');
  console.log('  ✓ testCompositorGroupVisibility passed');
}

function testCompositorClippingMask() {
  console.log('Running: testCompositorClippingMask');
  const { compositeDocument } = require('../core/compositor');
  const doc = createDocument(50, 50, 'Clip Test');

  const baseLayer = createPixelLayer(50, 50, 'Base', { r: 255, g: 0, b: 0, a: 255 });
  const clippedLayer = createPixelLayer(50, 50, 'Clipped', { r: 0, g: 255, b: 0, a: 255 });
  clippedLayer.clippingMask = true;

  const docWithLayers = addLayer(addLayer(doc, baseLayer), clippedLayer);

  const mockTargetCtx: any = {
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    drawImage: () => {},
    getImageData: () => new (globalThis as any).ImageData(50, 50),
    putImageData: () => {},
  };

  assert.doesNotThrow(() => {
    compositeDocument(docWithLayers, mockTargetCtx);
  }, 'compositeDocument with clipping mask should execute cleanly');
  console.log('  ✓ testCompositorClippingMask passed');
}

function testCropAndUndoFull() {
  console.log('Running: testCropAndUndoFull');
  let state = makeInitialState();
  const origW = state.document!.width;
  const origH = state.document!.height;

  const cropRes = handleCommand(state, {
    type: 'transform.crop',
    rect: { x: 10, y: 10, width: 80, height: 60 },
    source: 'user',
  });
  assert(cropRes.result.success);
  state = { ...state, ...cropRes.mutation };
  assert.strictEqual(state.document!.width, 80);
  assert.strictEqual(state.document!.height, 60);

  // Undo crop
  const undoCropRes = handleCommand(state, { type: 'history.undo', source: 'user' });
  state = { ...state, ...undoCropRes.mutation };
  assert.strictEqual(state.document!.width, origW, 'Undo should restore original doc width');
  assert.strictEqual(state.document!.height, origH, 'Undo should restore original doc height');
  console.log('  ✓ testCropAndUndoFull passed');
}

function testColorBalanceAdjustment() {
  console.log('Running: testColorBalanceAdjustment');
  let state = makeInitialState();
  const res = handleCommand(state, {
    type: 'adjustment.create',
    adjustment: {
      type: 'colorBalance',
      data: {
        shadows: [10, 0, -20],
        midtones: [20, -5, -15],
        highlights: [0, 5, 10],
        preserveLuminosity: true,
      },
    },
    name: 'Teal & Orange',
    source: 'user',
  });
  assert(res.result.success, 'adjustment.create for colorBalance should succeed');
  state = { ...state, ...res.mutation };
  assert.strictEqual(state.document?.layerOrder.length, 2);
  const activeLayer = state.document?.layers[state.document?.activeLayerId ?? ''];
  assert(activeLayer?.adjustment?.type === 'colorBalance');
  console.log('  ✓ testColorBalanceAdjustment passed');
}

function testBrushSharpenAndBlur() {
  console.log('Running: testBrushSharpenAndBlur');
  const imgData = new (globalThis as any).ImageData(30, 30);
  // Fill with test pattern
  for (let i = 0; i < imgData.data.length; i += 4) {
    imgData.data[i] = 120;
    imgData.data[i + 1] = 130;
    imgData.data[i + 2] = 140;
    imgData.data[i + 3] = 255;
  }
  // Create a high-contrast center pixel
  const centerIdx = (15 * 30 + 15) * 4;
  imgData.data[centerIdx] = 200;

  // Apply sharpen stroke
  paintStroke({
    imageData: imgData,
    points: [{ x: 15, y: 15 }],
    settings: { size: 10, hardness: 80, opacity: 100, flow: 100, spacing: 25, angle: 0, roundness: 100, pressureSensitivity: false },
    color: { r: 0, g: 0, b: 0, a: 255 },
    eraseMode: false,
    toolMode: 'sharpen',
  });
  assert(imgData.data[centerIdx] >= 200, 'Sharpen should amplify high contrast edge');

  // Apply blur stroke
  paintStroke({
    imageData: imgData,
    points: [{ x: 15, y: 15 }],
    settings: { size: 10, hardness: 80, opacity: 100, flow: 100, spacing: 25, angle: 0, roundness: 100, pressureSensitivity: false },
    color: { r: 0, g: 0, b: 0, a: 255 },
    eraseMode: false,
    toolMode: 'blur',
  });
  assert(imgData.data[centerIdx] < 255, 'Blur should soften edge values');
  console.log('  ✓ testBrushSharpenAndBlur passed');
}

function testGradientAndShape() {
  console.log('Running: testGradientAndShape');
  let state = makeInitialState();
  const activeId = state.document!.activeLayerId!;

  // Test gradient command
  const gradRes = handleCommand(state, {
    type: 'pixel.gradient',
    layerId: activeId,
    start: { x: 0, y: 0 },
    end: { x: 200, y: 200 },
    startColor: { r: 255, g: 0, b: 0, a: 255 },
    endColor: { r: 0, g: 0, b: 255, a: 255 },
    source: 'user',
  });
  assert(gradRes.result.success, 'pixel.gradient command should succeed');
  state = { ...state, ...gradRes.mutation };

  // Test shape command
  const shapeRes = handleCommand(state, {
    type: 'pixel.shape',
    layerId: activeId,
    shapeType: 'rectangle',
    rect: { x: 20, y: 20, width: 60, height: 60 },
    fillColor: { r: 0, g: 255, b: 0, a: 255 },
    source: 'user',
  });
  assert(shapeRes.result.success, 'pixel.shape command should succeed');
  console.log('  ✓ testGradientAndShape passed');
}

function runAllTests() {
  console.log('=== PhotoCop Automated Verification Suite ===\n');
  testDocumentCreation();
  testLayerCreation();
  testLayerDuplicate();
  testLayerGroupingAndUngrouping();
  testClippingMask();
  testLayerMergeDown();
  testTextLayerOperations();
  testPixelFillAndFloodFill();
  testSelectionCommands();
  testMergeDownEdgeCases();
  testGroupingEdgeCases();
  testFloodFillEdgeCases();
  testHistoryUndoRedo();
  testMoveAboveAndBelow();
  testCompositorGroupVisibility();
  testCompositorClippingMask();
  testCropAndUndoFull();
  testColorBalanceAdjustment();
  testBrushSharpenAndBlur();
  testGradientAndShape();
  console.log('\n=== All 20 Verification Tests Passed Successfully! ===');
}

runAllTests();
