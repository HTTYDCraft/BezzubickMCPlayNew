
    /* ============================================
       LIQUID GLASS RUNTIME
       blobs, cursor trail, dock auto-hide, segment morph
       ============================================ */
    (() => {
        const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

        /* ---------- SVG goo filter (injected once) ---------- */
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
        svg.style.position = 'absolute';
        svg.innerHTML = `
    <defs>
      <filter id="liquid-goo">
        <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur"/>
        <feColorMatrix in="blur" mode="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="goo"/>
        <feBlend in="SourceGraphic" in2="goo"/>
      </filter>
    </defs>`;
        document.body.appendChild(svg);

        /* ---------- Background blobs ---------- */
        const blobLayer = document.createElement('div');
        blobLayer.className = 'lg-blobs';
        document.body.insertAdjacentElement('afterbegin', blobLayer);

        const bgLayer = document.createElement('div');
        bgLayer.className = 'lg-bg';
        document.body.insertAdjacentElement('afterbegin', bgLayer);

        const BLOBS = 7;
        const blobs = [];
        for (let i = 0; i < BLOBS; i++) {
            const b = document.createElement('div');
            b.className = 'lg-blob';
            const size = 220 + Math.random() * 360;
            b.style.width = b.style.height = `${size}px`;
            b.style.left = `${Math.random() * 100}%`;
            b.style.top  = `${Math.random() * 100}%`;
            blobLayer.appendChild(b);
            blobs.push({
                el: b,
                x: 0, y: 0,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                r: 40 + Math.random() * 30,    // morph speed
                phase: Math.random() * Math.PI * 2,
            });
        }

        let t = 0;
        function animateBlobs() {
            t += 0.008;
            for (const b of blobs) {
                b.x += b.vx;
                b.y += b.vy;
                // soft bounce off edges via wrap
                if (Math.abs(b.x) > 80) b.vx *= -1;
                if (Math.abs(b.y) > 80) b.vy *= -1;
                const r1 = 42 + Math.sin(t * b.r * 0.01 + b.phase) * 18;
                const r2 = 58 + Math.cos(t * b.r * 0.013 + b.phase) * 18;
                const r3 = 50 + Math.sin(t * b.r * 0.017 + b.phase * 1.5) * 15;
                const r4 = 50 + Math.cos(t * b.r * 0.011 + b.phase * 0.7) * 15;
                b.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
                b.el.style.borderRadius = `${r1}% ${100 - r1}% ${r2}% ${100 - r2}% / ${r3}% ${r4}% ${100 - r4}% ${100 - r3}%`;
            }
            if (!reduceMotion) requestAnimationFrame(animateBlobs);
        }
        if (!reduceMotion) animateBlobs();

        /* ---------- Cursor / touch trail ---------- */
        if (!reduceMotion) {
            const cvs = document.createElement('canvas');
            cvs.className = 'lg-cursor-canvas';
            document.body.appendChild(cvs);
            const ctx = cvs.getContext('2d');
            function resize() {
                cvs.width = innerWidth * devicePixelRatio;
                cvs.height = innerHeight * devicePixelRatio;
                cvs.style.width = `${innerWidth}px`;
                cvs.style.height = `${innerHeight}px`;
                ctx.scale(devicePixelRatio, devicePixelRatio);
            }
            resize();
            addEventListener('resize', resize);

            const points = [];
            const MAX_LIFE = 1100; // ms
            let lastEmit = 0;

            function emit(x, y, strong = false) {
                const now = performance.now();
                const dt = now - lastEmit;
                if (dt < 8 && !strong) return;
                lastEmit = now;
                const count = strong ? 8 : 1;
                for (let i = 0; i < count; i++) {
                    points.push({
                        x: x + (Math.random() - 0.5) * (strong ? 18 : 2),
                        y: y + (Math.random() - 0.5) * (strong ? 18 : 2),
                        born: now,
                        life: MAX_LIFE * (strong ? 1.3 : 1),
                        size: strong ? 22 + Math.random() * 14 : 14 + Math.random() * 6,
                    });
                }
                if (points.length > 280) points.splice(0, points.length - 280);
            }

            addEventListener('pointermove', (e) => emit(e.clientX, e.clientY, false), { passive: true });
            addEventListener('pointerdown', (e) => emit(e.clientX, e.clientY, true), { passive: true });

            function render() {
                ctx.clearRect(0, 0, innerWidth, innerHeight);
                const now = performance.now();
                for (let i = points.length - 1; i >= 0; i--) {
                    const p = points[i];
                    const age = now - p.born;
                    if (age > p.life) { points.splice(i, 1); continue; }
                    const k = 1 - age / p.life;
                    const r = p.size * k;
                    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.4);
                    g.addColorStop(0, `rgba(229, 180, 255, ${0.55 * k})`);
                    g.addColorStop(0.35, `rgba(191, 90, 242, ${0.32 * k})`);
                    g.addColorStop(1, 'rgba(191, 90, 242, 0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r * 2.4, 0, Math.PI * 2);
                    ctx.fill();
                }
                requestAnimationFrame(render);
            }
            render();
        }

        /* ---------- Dock: Safari-style auto-hide ---------- */
        const dock = document.querySelector('.lg-dock');
        if (dock) {
            let lastY = scrollY;
            let ticking = false;
            addEventListener('scroll', () => {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    const y = scrollY;
                    const dy = y - lastY;
                    if (Math.abs(dy) > 6) {
                        dock.classList.toggle('is-hidden', dy > 0 && y > 80);
                        lastY = y;
                    }
                    ticking = false;
                });
            }, { passive: true });

            /* segment morph indicator */
            const segs = dock.querySelectorAll('.lg-dock__seg');
            let indicator = dock.querySelector('.lg-dock__indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'lg-dock__indicator';
                dock.appendChild(indicator);
            }
            function moveIndicator(target) {
                const dockRect = dock.getBoundingClientRect();
                const r = target.getBoundingClientRect();
                indicator.style.width = `${r.width}px`;
                indicator.style.transform = `translateX(${r.left - dockRect.left - 6}px)`;
            }
            const active = dock.querySelector('.lg-dock__seg.is-active') || segs[1];
            if (active) requestAnimationFrame(() => moveIndicator(active));
            segs.forEach(s => s.addEventListener('pointerenter', () => moveIndicator(s)));
            dock.addEventListener('pointerleave', () => {
                const a = dock.querySelector('.lg-dock__seg.is-active');
                if (a) moveIndicator(a);
            });
            addEventListener('resize', () => {
                const a = dock.querySelector('.lg-dock__seg.is-active');
                if (a) moveIndicator(a);
            });
        }
    })();

