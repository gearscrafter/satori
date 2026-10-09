/* Satori icon set: one consistent 16x16 line style that inherits currentColor. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TrailIcons = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // A part is a path string, or ['circle', cx, cy, r, filled?], or ['rect', x, y, w, h, rx?].
    const ICONS = {
        // navigation and actions
        home: ['M2 7.5L8 2.5L14 7.5', 'M3.5 6.5V13.5H12.5V6.5'],
        back: ['M10 3L5 8L10 13'],
        forward: ['M6 3L11 8L6 13'],
        reset: ['M3 8a5 5 0 1 0 1.6-3.7', 'M3 2.5V5.5H6'],
        search: [['circle', 7, 7, 4.5], 'M10.5 10.5L14 14'],
        check: ['M3.500 8.500L6.500 11.500L12.500 4.500'],
        close: ['M3.5 3.5L12.5 12.5', 'M12.5 3.5L3.5 12.5'],
        'zoom-in': [['circle', 7, 7, 4.5], 'M10.5 10.5L14 14', 'M5 7H9', 'M7 5V9'],
        'zoom-out': [['circle', 7, 7, 4.5], 'M10.5 10.5L14 14', 'M5 7H9'],
        help: [['circle', 8, 8, 6.5], 'M6.2 6.3a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.4', ['circle', 8, 11.5, 0.5, true]],
        open: ['M9 2H14V7', 'M14 2L7.5 8.5', 'M12 9.5V14H2V4H6.5'],
        trace: [['circle', 3.2, 3.8, 1.6], ['circle', 12.8, 12.2, 1.6], 'M4.8 3.8H8a2 2 0 0 1 2 2v4.4a2 2 0 0 0 2 2'],
        focus: [['circle', 8, 8, 5], ['circle', 8, 8, 1.4, true], 'M8 1V3', 'M8 13V15', 'M1 8H3', 'M13 8H15'],
        move: ['M8 1.5V14.5', 'M1.5 8H14.5', 'M6 3.5L8 1.5L10 3.5', 'M6 12.5L8 14.5L10 12.5', 'M3.5 6L1.5 8L3.5 10', 'M12.5 6L14.5 8L12.5 10'],
        pointer: ['M3 2L12.5 7L8.3 8.4L6.8 13Z'],
        warning: ['M8 2L14.5 13.5H1.5Z', 'M8 6.5V9.5', ['circle', 8, 11.5, 0.5, true]],
        'arrow-up': ['M8 13V3', 'M4 7L8 3L12 7'],
        'arrow-down': ['M8 3V13', 'M4 9L8 13L12 9'],
        dot: [['circle', 8, 8, 3, true]],
        eye: ['M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z', ['circle', 8, 8, 2]],
        'eye-off': ['M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z', ['circle', 8, 8, 2], 'M2.5 13.5L13.5 2.5'],
        // edit mode tools
        flame: ['M8 1.500C8.500 4 11.500 5.500 11.500 9a3.500 3.500 0 0 1-7 0c0-1.500.700-2.500 1.500-3.300.200 1 .700 1.500 1.300 1.800C7.200 5.500 7.300 3.200 8 1.500Z'],
        edit: ['M2.5 13.5L3 10.3L10.7 2.6a1.4 1.4 0 0 1 2 0l.7.7a1.4 1.4 0 0 1 0 2L5.7 13Z', 'M9.3 4L12 6.7'],
        pen: ['M2 11.5c1.6-6 3.4-6.5 4.6-3.2S9.600 11 14 4.500'],
        line: ['M3 13L13 3'],
        arrow: ['M3 13L13 3', 'M7 3H13V9'],
        rect: [['rect', 2.5, 3.5, 11, 9, 1]],
        ellipse: ['M8 3.500c3.300 0 6 1.900 6 4.500s-2.700 4.500-6 4.500S2 10.600 2 8s2.700-4.500 6-4.500Z'],
        eraser: ['M10 3L13.500 6.500L7.500 12.500H4.500L2.500 10.500Z', 'M6 7L9.500 10.500', 'M7.500 12.500H14'],
        undo: ['M5 6H10a3 3 0 0 1 0 6H6', 'M7.500 3.500L5 6L7.500 8.500'],
        redo: ['M11 6H6a3 3 0 0 0 0 6h4', 'M8.500 3.500L11 6L8.500 8.500'],
        trash: ['M2.500 4.500H13.500', 'M6 4.500V3H10V4.500', 'M4 4.500L4.700 13H11.300L12 4.500', 'M7 7V11', 'M9 7V11'],
        fill: ['M3 11L8 3L13 11Z', 'M2.500 13.500H13.500'],
        // symbol kinds
        class: [['rect', 2.5, 3, 11, 10, 1.500], 'M2.500 6.500H13.500'],
        interface: [['circle', 5, 8, 2.500], 'M7.500 8H13.500'],
        enum: ['M3 4.500H13', 'M3 8H13', 'M3 11.500H9'],
        method: ['M8 1.800L13.500 4.800V11.200L8 14.200L2.500 11.200V4.800Z', 'M2.500 4.800L8 8L13.500 4.800', 'M8 8V14.200'],
        function: ['M5.500 3C4 3 4 4.200 4 5.200V6.200C4 7 3.500 7.800 2.500 8C3.500 8.200 4 9 4 9.800V10.800C4 11.800 4 13 5.500 13', 'M10.500 3C12 3 12 4.200 12 5.200V6.200C12 7 12.500 7.800 13.500 8C12.500 8.200 12 9 12 9.800V10.800C12 11.800 12 13 10.500 13'],
        constructor: [['rect', 2.500, 2.500, 11, 11, 2], 'M8 5.500V10.500', 'M5.500 8H10.500'],
        field: [['rect', 2.500, 5, 11, 6, 1], 'M6.500 5V11'],
        property: ['M2.500 5H13.500', 'M2.500 11H13.500', ['circle', 6, 5, 1.700, true], ['circle', 10, 11, 1.700, true]],
        folder: ['M1.500 4.500V12.500H14.500V5.500H7.500L6.200 3.500H1.500Z'],
        package: ['M8 1.800L13.500 4.800V11.200L8 14.200L2.500 11.200V4.800Z', 'M2.500 4.800L8 8L13.500 4.800', 'M8 8V14.200', 'M5.200 3.300L10.800 6.400'],
        sdk: [['rect', 4, 4, 8, 8, 1], 'M6.500 2V4', 'M9.500 2V4', 'M6.500 12V14', 'M9.500 12V14', 'M2 6.500H4', 'M2 9.500H4', 'M12 6.500H14', 'M12 9.500H14'],
        // architecture layers
        'layer-view': [['rect', 2, 2.500, 12, 8.500, 1], 'M5.500 14H10.500', 'M8 11V14'],
        'layer-state': ['M1.500 8H4.500L6.500 2.500L9.500 13.500L11.500 8H14.500'],
        'layer-service': ['M4.500 12.500a3 3 0 0 1-.4-5.970A4.500 4.500 0 0 1 12.800 6.200 3.200 3.200 0 0 1 12 12.500Z'],
        'layer-model': ['M2.500 4.500c0 1.100 2.500 2 5.500 2s5.500-.9 5.500-2-2.500-2-5.500-2-5.500.9-5.500 2Z', 'M2.500 4.500V11.500c0 1.100 2.500 2 5.500 2s5.500-.9 5.500-2V4.500', 'M2.500 8c0 1.100 2.500 2 5.500 2s5.500-.9 5.500-2'],
        'layer-generic': [['rect', 2.500, 2.500, 11, 3, 1], ['rect', 2.500, 6.500, 11, 3, 1], ['rect', 2.500, 10.500, 11, 3, 1]],
        'layer-utility': ['M10.500 2.500a3.500 3.500 0 0 0-3.200 4.800L2.500 12.100a1.400 1.400 0 0 0 2 2l4.800-4.800a3.500 3.500 0 0 0 4.800-3.200l-2.200 2.200-2-.6-.6-2 2.200-2.200Z']
    };

    // Which icon represents each graph node kind.
    const KIND_ICON = {
        class: 'class', mixin: 'interface', interface: 'interface', enum: 'enum', method: 'method', function: 'function',
        constructor: 'constructor', field: 'field', property: 'property', variable: 'field', enummember: 'enum',
        package: 'package', library: 'open'
    };

    function names() { return Object.keys(ICONS); }
    function parts(name) { return ICONS[name] || null; }
    function iconForKind(kind) { return KIND_ICON[kind] || 'dot'; }

    /** Builds an <svg> element (browser only). */
    function create(name, size) {
        const spec = ICONS[name] || ICONS.dot;
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        const px = String(size || 14);
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', px);
        svg.setAttribute('height', px);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.setAttribute('class', 'ico ico-' + name);
        spec.forEach(function (part) {
            let node;
            if (typeof part === 'string') {
                node = document.createElementNS(ns, 'path');
                node.setAttribute('d', part);
            } else if (part[0] === 'circle') {
                node = document.createElementNS(ns, 'circle');
                node.setAttribute('cx', part[1]);
                node.setAttribute('cy', part[2]);
                node.setAttribute('r', part[3]);
                if (part[4]) { node.setAttribute('fill', 'currentColor'); node.setAttribute('stroke', 'none'); }
            } else {
                node = document.createElementNS(ns, 'rect');
                node.setAttribute('x', part[1]);
                node.setAttribute('y', part[2]);
                node.setAttribute('width', part[3]);
                node.setAttribute('height', part[4]);
                if (part[5]) { node.setAttribute('rx', part[5]); }
            }
            svg.appendChild(node);
        });
        return svg;
    }

    return { names, parts, iconForKind, create, KIND_ICON };
});
