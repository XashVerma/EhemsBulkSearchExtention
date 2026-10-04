(function() {
    'use strict';

    let oldPanel = document.getElementById('ehrms-perfect-panel');
    if (oldPanel) oldPanel.remove();
    let oldToggle = document.getElementById('ehrms-fab-toggle');
    if (oldToggle) oldToggle.remove();

    let allResults = [];
    let isStopped = false;
    let isPaused = false;
    let currentIndex = 0;
    let activeEntriesList = []; 
    let missingPhase2List = [];
    let currentPhase = 1;

    function sanitizeDeptId(rawId) {
        if (!rawId) return null;
        let clean = rawId.toString().replace(/\D/g, '');
        if (clean.length === 8) {
            return '0' + clean;
        } else if (clean.length === 9) {
            return clean;
        }
        return clean.length >= 7 ? clean : null;
    }

    function downloadCSV() {
        if (!allResults.length) {
            alert("डाउनलोड करने के लिए अभी कोई डेटा नहीं है!");
            return;
        }
        let headers = [
            "क्र.सं.", "सर्च मोबाइल", "Departmental ID", "सर्च माध्यम", "कर्मचारी का नाम",
            "eHRMS ID", "पद (Designation)", "जनपद (District)", "तैनाती स्थल (Posting)",
            "मूल विभाग (Department)", "संवर्ग (Cadre)", "स्थिति (Status)"
        ];

        let csvRows = [headers.map(h => `"${h}"`).join(",")];
        allResults.forEach((r, idx) => {
            csvRows.push([
                idx + 1, r.searchMob, r.searchDeptId, r.foundVia, r.name,
                r.hrmsId, r.desig, r.district, r.posting, r.dept, r.cadre, r.status
            ].map(val => `"${val || '-'}"`).join(","));
        });

        let csvString = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
        let a = document.createElement("a");
        a.href = encodeURI(csvString);
        a.download = "Home_Employees_Combined_List.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    let fab = document.createElement('button');
    fab.id = 'ehrms-fab-toggle';
    fab.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999999;background:#0284c7;color:#fff;border:1.5px solid #38bdf8;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:bold;cursor:pointer;box-shadow:0 4px 15px rgba(0,0,0,0.5);display:flex;align-items:center;gap:5px;font-family:sans-serif;';
    fab.innerHTML = '<span>⚡ बल्क सर्च</span> <span id="fab-arrow" style="font-size:10px;">▼</span>';
    document.body.appendChild(fab);

    let panel = document.createElement('div');
    panel.id = 'ehrms-perfect-panel';
    panel.style.cssText = 'position:fixed;top:48px;right:10px;width:92%;max-width:395px;background:#0f172a;color:#fff;z-index:999999998;padding:12px;border-radius:14px;border:2px solid #38bdf8;box-shadow:0 10px 35px rgba(0,0,0,0.9);font-family:sans-serif;font-size:12px;display:none;touch-action:none;';
    
    panel.innerHTML = `
        <div id="panel-drag-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;cursor:move;user-select:none;touch-action:none;padding-bottom:4px;border-bottom:1px solid #1e293b;">
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="color:#94a3b8;font-size:12px;">⠿</span>
                <b style="color:#38bdf8;font-size:13px;">मानव संपदा स्मार्ट 2-फेज सर्च</b>
            </div>
            <button id="btn-close-box" title="मिनीमाइज़ करें" style="background:#ef4444;color:#fff;border:none;padding:2px 8px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">✕</button>
        </div>

        <div style="background:#1e293b;padding:5px 8px;border-radius:6px;margin-bottom:6px;font-size:11px;display:flex;justify-content:space-between;align-items:center;">
            <span>विभाग: <b style="color:#22c55e;">HOME</b></span>
            <span>कुल सुरक्षित: <b id="lbl-saved-count" style="color:#38bdf8;font-size:12px;">0 रिकॉर्ड</b></span>
        </div>

        <div style="background:#020617;border:1px solid #334155;padding:5px 8px;border-radius:6px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;font-size:11px;">
            <span style="color:#cbd5e1;">सर्च मोड:</span>
            <select id="sel-search-mode" style="background:#1e293b;color:#38bdf8;border:1px solid #475569;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:bold;">
                <option value="AUTO" selected>🤖 ऑटो (फेज 1: Mobile ➔ फेज 2: ID)</option>
                <option value="MOB_ONLY">📱 केवल मोबाइल सर्च</option>
                <option value="DEPT_ONLY">🆔 केवल Dept ID (PNO) सर्च</option>
            </select>
        </div>

        <div style="background:#020617;border:1px solid #334155;padding:5px 8px;border-radius:6px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;font-size:11px;">
            <span style="color:#cbd5e1;">प्रति सर्च इंतज़ार (Delay):</span>
            <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" id="inp-delay-sec" value="3" min="1" max="10" style="width:42px;background:#1e293b;color:#38bdf8;border:1px solid #475569;border-radius:4px;padding:2px 4px;text-align:center;font-weight:bold;">
                <span style="color:#94a3b8;">सेकंड</span>
            </div>
        </div>

        <div id="box-status-msg" style="margin-bottom:6px;color:#facc15;font-weight:bold;font-size:11px;line-height:1.4;">
            ▶ एक्सेल से मोबाइल और/या Dept ID पेस्ट करें।
        </div>

        <textarea id="txt-bulk-mobiles" rows="3" style="width:100%;box-sizing:border-box;background:#020617;color:#38bdf8;border:1px solid #334155;border-radius:6px;padding:6px;font-size:11px;font-family:monospace;" placeholder="यहाँ पेस्ट करें: मोबाइल, 8/9 अंकों की Dept ID, या एक्सेल के दोनों कॉलम..."></textarea>

        <div style="display:flex;gap:5px;margin-top:6px;">
            <button id="btn-start-process" style="flex:1.2;background:#10b981;color:#fff;font-weight:bold;padding:10px 4px;border:none;border-radius:6px;cursor:pointer;font-size:11px;">🚀 ऑटो-सर्च</button>
            <button id="btn-stop-process" style="flex:1;background:#64748b;color:#fff;font-weight:bold;padding:10px 4px;border:none;border-radius:6px;cursor:pointer;font-size:11px;" disabled>⏹ रोकें</button>
            <button id="btn-download-csv" style="flex:1.1;background:#f59e0b;color:#fff;font-weight:bold;padding:10px 4px;border:none;border-radius:6px;cursor:pointer;font-size:11px;">📥 EXCEL</button>
        </div>
    `;
    document.body.appendChild(panel);

    let dragHeader = document.getElementById('panel-drag-header');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    function startDrag(e) {
        if (e.target.id === 'btn-close-box') return;
        isDragging = true;
        let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        let clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        startX = clientX;
        startY = clientY;

        let rect = panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = initialLeft + 'px';
        panel.style.top = initialTop + 'px';
    }

    function doDrag(e) {
        if (!isDragging) return;
        let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        let clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        let dx = clientX - startX;
        let dy = clientY - startY;

        let newLeft = Math.max(5, Math.min(window.innerWidth - panel.offsetWidth - 5, initialLeft + dx));
        let newTop = Math.max(5, Math.min(window.innerHeight - panel.offsetHeight - 5, initialTop + dy));

        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
        if (e.cancelable) e.preventDefault();
    }

    function stopDrag() { isDragging = false; }

    dragHeader.addEventListener('mousedown', startDrag);
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
    dragHeader.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('touchmove', doDrag, { passive: false });
    window.addEventListener('touchend', stopDrag);

    function togglePanel(open = null) {
        let isVisible = panel.style.display !== 'none';
        let shouldOpen = open !== null ? open : !isVisible;
        panel.style.display = shouldOpen ? 'block' : 'none';
        document.getElementById('fab-arrow').textContent = shouldOpen ? '▲' : '▼';
        fab.style.background = shouldOpen ? '#0369a1' : '#0284c7';
    }

    fab.onclick = () => togglePanel();
    document.getElementById('btn-close-box').onclick = () => togglePanel(false);
    document.getElementById('btn-download-csv').onclick = () => downloadCSV();

    let btnStart = document.getElementById('btn-start-process');
    let btnStop = document.getElementById('btn-stop-process');
    let stMsg = document.getElementById('box-status-msg');
    let txtBox = document.getElementById('txt-bulk-mobiles');
    let selMode = document.getElementById('sel-search-mode');

    txtBox.addEventListener('input', function() {
        if (isPaused || currentPhase === 2) {
            isPaused = false;
            currentPhase = 1;
            currentIndex = 0;
            missingPhase2List = [];
            btnStart.innerHTML = '🚀 ऑटो-सर्च';
            btnStart.style.background = '#10b981';
            stMsg.innerHTML = "▶ नया डेटा डिटेक्ट हुआ। 'ऑटो-सर्च' दबाकर शुरू करें।";
        }
    });

    btnStop.onclick = function() {
        isStopped = true;
        isPaused = true;
        btnStop.disabled = true;
        btnStop.style.background = '#64748b';
        stMsg.innerHTML = `⏸ <span style="color:#ef4444;">सर्च रोक दी गई है!</span> (${currentIndex}/${activeEntriesList.length} पूर्ण)<br><span style="color:#38bdf8;">'जारी रखें' दबाकर आगे बढ़ें।</span>`;
        btnStart.disabled = false;
        btnStart.style.background = '#0284c7';
        btnStart.innerHTML = '▶ जारी रखें';
    };

    function parseSmartInput(rawText) {
        let lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        let parsed = [];

        for (let line of lines) {
            let mobMatch = line.match(/[6-9]\d{9}/);
            let mob = mobMatch ? mobMatch[0] : null;

            let remaining = mob ? line.replace(mob, '') : line;
            let idMatch = remaining.match(/\b\d{8,9}\b/);
            let deptId = null;

            if (idMatch) {
                deptId = sanitizeDeptId(idMatch[0]);
            } else if (!mob) {
                let anyId = line.match(/\b\d{8,9}\b/);
                if (anyId) deptId = sanitizeDeptId(anyId[0]);
            }

            if (mob || deptId) {
                parsed.push({ mob: mob || null, deptId: deptId || null });
            }
        }

        let uniqueMap = new Map();
        for (let item of parsed) {
            let key = `${item.mob || ''}_${item.deptId || ''}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
            }
        }
        return Array.from(uniqueMap.values());
    }

    function extractCurrentTableData() {
        let tables = document.querySelectorAll('table');
        let records = [];

        for (let tbl of tables) {
            let rows = tbl.querySelectorAll('tr');
            for (let tr of rows) {
                let tds = Array.from(tr.querySelectorAll('td')).map(t => t.innerText.trim());
                if (tds.length >= 6) {
                    if (tds[0].toLowerCase().includes('sno') || tds[1].toLowerCase().includes('name') || tds[2].toLowerCase().includes('hrms')) {
                        continue;
                    }
                    records.push({
                        name: tds[1] || '-',
                        hrmsId: tds[2] || '-',
                        desig: tds[3] || '-',
                        district: tds[4] || '-',
                        posting: tds[5] || '-',
                        dept: tds[6] || '-',
                        cadre: tds[7] || '-',
                        status: tds[8] || '-'
                    });
                }
            }
        }

        let seenKeys = new Set();
        let uniqueRecords = [];
        for (let r of records) {
            let key = `${r.hrmsId}|${r.name}|${r.desig}|${r.district}|${r.posting}|${r.cadre}|${r.status}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueRecords.push(r);
            }
        }

        return {
            found: uniqueRecords.length > 0,
            items: uniqueRecords
        };
    }

    function getActivePortalInput(searchType) {
        let panelEl = document.getElementById('ehrms-perfect-panel');
        let allInputs = Array.from(document.querySelectorAll('input:not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"]):not([type="hidden"])'));

        let portalInputs = allInputs.filter(inp => {
            if (panelEl && panelEl.contains(inp)) return false;
            let rect = inp.getBoundingClientRect();
            let isVisible = inp.offsetParent !== null && 
                            (rect.width > 0 || inp.offsetWidth > 0) && 
                            (rect.height > 0 || inp.offsetHeight > 0) &&
                            window.getComputedStyle(inp).visibility !== 'hidden' &&
                            window.getComputedStyle(inp).display !== 'none';
            return isVisible;
        });

        if (portalInputs.length === 1) {
            return portalInputs[0];
        }

        if (portalInputs.length > 1) {
            if (searchType === 'DEPT') {
                let match = portalInputs.find(inp => {
                    let s = (inp.id + ' ' + inp.name + ' ' + (inp.placeholder || '')).toLowerCase();
                    return s.includes('dept') || s.includes('pno') || s.includes('id') || s.includes('departmental');
                });
                if (match) return match;
            } else {
                let match = portalInputs.find(inp => {
                    let s = (inp.id + ' ' + inp.name + ' ' + (inp.placeholder || '')).toLowerCase();
                    return s.includes('mob') || s.includes('phone');
                });
                if (match) return match;
            }
            return portalInputs[0];
        }

        if (searchType === 'DEPT') {
            let direct = document.querySelector('input[id*="dept" i], input[name*="dept" i], input[id*="pno" i], input[name*="pno" i], input[id*="departmental" i], input[name*="departmental" i]');
            if (direct && (!panelEl || !panelEl.contains(direct))) return direct;
        } else {
            let direct = document.querySelector('input[id*="mob" i], input[name*="mob" i]');
            if (direct && (!panelEl || !panelEl.contains(direct))) return direct;
        }

        return document.querySelector('input[type="text"]:not([style*="none"])');
    }

    function putValueAndSubmit(searchType, value) {
        let deptSel = document.querySelector('select');
        if (deptSel && (!deptSel.value || deptSel.value === '0' || deptSel.selectedIndex === 0)) {
            for (let opt of deptSel.options) {
                if (opt.text.toUpperCase().includes('HOME')) {
                    deptSel.value = opt.value;
                    deptSel.dispatchEvent(new Event('change', { bubbles: true }));
                    break;
                }
            }
        }

        if (searchType === 'DEPT') {
            let rdoDept = document.querySelector('input[type="radio"][value*="Departmental" i], input[id*="Departmental" i], input[id*="Dept" i]');
            if (rdoDept && !rdoDept.checked) {
                rdoDept.checked = true;
                rdoDept.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            let rdoMob = document.querySelector('input[type="radio"][value*="Mobile" i], input[id*="Mobile" i]');
            if (rdoMob && !rdoMob.checked) {
                rdoMob.checked = true;
                rdoMob.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        let targetInput = getActivePortalInput(searchType);

        if (targetInput) {
            targetInput.focus();
            targetInput.value = value;
            targetInput.setAttribute('value', value);
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
            targetInput.blur();
        }

        if (typeof window.Page_IsValid !== 'undefined') window.Page_IsValid = true;
        if (typeof window.Page_BlockSubmit !== 'undefined') window.Page_BlockSubmit = false;

        let submitBtn = document.querySelector('input[type="submit"], button[type="submit"], input[value*="SUBMIT"]');
        if (submitBtn) {
            submitBtn.click();
        } else if (document.forms[0]) {
            document.forms[0].submit();
        }
    }

    btnStart.onclick = async function() {
        let delaySec = parseInt(document.getElementById('inp-delay-sec').value) || 3;
        if (delaySec < 1) delaySec = 2;
        let mode = selMode.value;
        let countLbl = document.getElementById('lbl-saved-count');

        // चरण 2: छूटे हुए लोगों को Departmental ID से खोजना
        if (currentPhase === 2) {
            if (!missingPhase2List.length) {
                alert("फेज 2 के लिए कोई छूटा हुआ कर्मचारी नहीं है!");
                return;
            }

            isStopped = false;
            isPaused = false;
            btnStart.disabled = true;
            btnStart.style.background = '#64748b';
            btnStop.disabled = false;
            btnStop.style.background = '#ef4444';

            for (let i = 0; i < missingPhase2List.length; i++) {
                if (isStopped) { isPaused = true; break; }

                let item = missingPhase2List[i];
                stMsg.innerHTML = `[फेज 2: ${i+1}/${missingPhase2List.length}] Dept ID सर्च: <b>${item.deptId}</b>`;

                putValueAndSubmit('DEPT', item.deptId);
                await new Promise(r => setTimeout(r, delaySec * 1000));
                if (isStopped) { isPaused = true; break; }

                let res = extractCurrentTableData();
                if (res.found && res.items.length > 0) {
                    let targetIdx = allResults.findIndex(r => r.searchDeptId === item.deptId || (item.mob && r.searchMob === item.mob));
                    if (targetIdx !== -1) {
                        allResults.splice(targetIdx, 1);
                    }

                    res.items.forEach(d => {
                        allResults.push({
                            searchMob: item.mob || '-',
                            searchDeptId: item.deptId,
                            foundVia: 'Dept ID',
                            name: d.name,
                            hrmsId: d.hrmsId,
                            desig: d.desig,
                            district: d.district,
                            posting: d.posting,
                            dept: d.dept,
                            cadre: d.cadre,
                            status: d.status
                        });
                    });

                    stMsg.innerHTML = `✓ ID से मिला: <span style="color:#22c55e;">${res.items[0].name} (${res.items[0].hrmsId})</span>`;
                } else {
                    stMsg.innerHTML = `✗ ID से भी नहीं मिला (${item.deptId})`;
                }

                countLbl.innerText = `${allResults.length} रिकॉर्ड`;
                await new Promise(r => setTimeout(r, 800));
            }

            if (!isStopped) {
                currentPhase = 1;
                stMsg.innerHTML = "✅ सभी 2-फेज सर्च पूर्ण! Excel डाउनलोड हो रही है...";
                btnStart.innerHTML = '🚀 ऑटो-सर्च';
                btnStart.style.background = '#10b981';
                btnStart.disabled = false;
                btnStop.disabled = true;
                btnStop.style.background = '#64748b';
                downloadCSV();
            }
            return;
        }

        // चरण 1: सामान्य सर्च
        let raw = txtBox.value;
        let entries = parseSmartInput(raw);

        if (!entries.length) {
            alert("कृपया बॉक्स में 10 अंकों का मोबाइल नंबर या 8/9 अंकों की Departmental ID पेस्ट करें!");
            return;
        }

        let isResuming = isPaused && currentIndex < activeEntriesList.length && JSON.stringify(entries) === JSON.stringify(activeEntriesList);

        if (!isResuming) {
            allResults = [];
            currentIndex = 0;
            activeEntriesList = entries;
            missingPhase2List = [];
        }

        isStopped = false;
        isPaused = false;

        btnStart.disabled = true;
        btnStart.style.background = '#64748b';
        btnStop.disabled = false;
        btnStop.style.background = '#ef4444';

        for (let i = currentIndex; i < activeEntriesList.length; i++) {
            if (isStopped) { isPaused = true; break; }

            let entry = activeEntriesList[i];
            let itemData = null;
            let foundVia = '-';

            if (mode === 'DEPT_ONLY') {
                if (entry.deptId) {
                    stMsg.innerHTML = `[${i+1}/${activeEntriesList.length}] सर्च (Dept ID): <b>${entry.deptId}</b>`;
                    putValueAndSubmit('DEPT', entry.deptId);
                    await new Promise(r => setTimeout(r, delaySec * 1000));
                    if (isStopped) { isPaused = true; break; }

                    let res = extractCurrentTableData();
                    if (res.found) {
                        itemData = res.items;
                        foundVia = 'Dept ID';
                    }
                }
            } else {
                if (entry.mob) {
                    stMsg.innerHTML = `[${i+1}/${activeEntriesList.length}] सर्च (Mobile): <b>${entry.mob}</b>`;
                    putValueAndSubmit('MOB', entry.mob);
                    await new Promise(r => setTimeout(r, delaySec * 1000));
                    if (isStopped) { isPaused = true; break; }

                    let res = extractCurrentTableData();
                    if (res.found) {
                        itemData = res.items;
                        foundVia = 'Mobile';
                    }
                } else if (mode === 'AUTO' && entry.deptId) {
                    missingPhase2List.push(entry);
                }
            }

            if (itemData && itemData.length > 0) {
                itemData.forEach(item => {
                    allResults.push({
                        searchMob: entry.mob || '-',
                        searchDeptId: entry.deptId || '-',
                        foundVia: foundVia,
                        name: item.name,
                        hrmsId: item.hrmsId,
                        desig: item.desig,
                        district: item.district,
                        posting: item.posting,
                        dept: item.dept,
                        cadre: item.cadre,
                        status: item.status
                    });
                });
                let extra = itemData.length > 1 ? ` (+${itemData.length - 1} अतिरिक्त)` : '';
                stMsg.innerHTML = `✓ मिला: <span style="color:#22c55e;">${itemData[0].name} (${itemData[0].hrmsId})</span>${extra}`;
            } else if (entry.mob) {
                allResults.push({
                    searchMob: entry.mob || '-',
                    searchDeptId: entry.deptId || '-',
                    foundVia: 'Not Found',
                    name: 'Not Found',
                    hrmsId: '-',
                    desig: '-',
                    district: '-',
                    posting: '-',
                    dept: '-',
                    cadre: '-',
                    status: '-'
                });
                stMsg.innerHTML = `✗ मोबाइल से नहीं मिला (${entry.mob})`;

                if (mode === 'AUTO' && entry.deptId) {
                    missingPhase2List.push(entry);
                }
            }

            countLbl.innerText = `${allResults.length} रिकॉर्ड`;
            currentIndex = i + 1;
            await new Promise(r => setTimeout(r, 800));
        }

        if (!isStopped) {
            if (mode === 'AUTO' && missingPhase2List.length > 0) {
                currentPhase = 2;
                btnStop.disabled = true;
                btnStop.style.background = '#64748b';
                btnStart.disabled = false;
                btnStart.style.background = '#0284c7';
                btnStart.innerHTML = `🆔 छूटे हुए ${missingPhase2List.length} लोगों को खोजें`;

                stMsg.innerHTML = `
                    <div style="background:rgba(234,179,8,0.15);border:1px solid #facc15;padding:6px;border-radius:6px;margin-top:2px;">
                        📱 <b>फेज 1 (मोबाइल) पूर्ण!</b><br>
                        👉 <span style="color:#f87171;font-weight:bold;">${missingPhase2List.length} लोग नहीं मिले।</span><br>
                        <span style="color:#38bdf8;">1. ऊपर स्क्रीन पर <b>'Departmental Id'</b> और <b>'HOME'</b> चुनें।</span><br>
                        <span style="color:#4ade80;">2. फिर नीचे नीला बटन दबाएँ।</span>
                    </div>
                `;
            } else {
                stMsg.innerHTML = "✅ सभी सर्च पूर्ण! Excel डाउनलोड हो रही है...";
                isPaused = false;
                currentIndex = 0;
                btnStart.innerHTML = '🚀 ऑटो-सर्च';
                btnStart.style.background = '#10b981';
                btnStart.disabled = false;
                btnStop.disabled = true;
                btnStop.style.background = '#64748b';
                downloadCSV();
            }
        }
    };
})();