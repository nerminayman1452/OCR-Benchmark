
        let linesData = [];
        let allWordsData = []; 
        let originalJson = null;
        let filename = "";
        let imageB64 = "";
        let currentIdx = -1;
        let imgObj = new Image();
        let scale = 1.0; 
        let folderPairs = [];
        let currentPairIndex = -1;

        // استعادة المسار المحفوظ
        window.onload = () => {
            const savedPath = localStorage.getItem('lastSaveDir');
            if(savedPath && document.getElementById('saveDir')) {
                document.getElementById('saveDir').value = savedPath;
            }
        };

        // دالة عرض الأخطاء أو الحالة في منتصف الشاشة (تتبع مرئي)
        function showScreenStatus(iconHTML, title, msg, isError = false) {
            const hint = document.getElementById('uploadHint');
            const colorClass = isError ? 'text-red-500' : 'text-blue-500';
            const titleColor = isError ? 'text-red-400' : 'text-slate-300';
            
            hint.innerHTML = `
                <div class="${colorClass} text-6xl mb-4">${iconHTML}</div>
                <h2 class="text-2xl font-bold ${titleColor} mb-2">${title}</h2>
                <p class="text-sm text-slate-300 bg-slate-800 p-4 rounded max-w-lg text-center leading-loose" dir="rtl">${msg}</p>
            `;
            hint.style.display = 'flex';
            hint.style.opacity = '1';
            document.getElementById('imgCanvas').style.display = 'none';
        }

        function triggerSingleUpload() {
            const jsonFile = document.getElementById('jsonUpload').files[0];
            const imgFile = document.getElementById('imgUpload').files[0];
            if(!jsonFile || !imgFile) {
                showScreenStatus('<i class="fa-solid fa-circle-exclamation"></i>', 'ملفات ناقصة', 'الرجاء اختيار ملف الصورة وملف الـ JSON معاً من الأزرار بالأعلى.', true);
                return;
            }
            currentPairIndex = -1;
            document.getElementById('fileExplorerPanel').classList.add('hidden');
            processUpload(jsonFile, imgFile, document.getElementById('uploadBtn'));
        }

        function handleFolderSelect(e) {
            const files = Array.from(e.target.files);
            if (files.length === 0) {
                showScreenStatus('<i class="fa-solid fa-folder-open"></i>', 'الفولدر فارغ', 'لم يتمكن المتصفح من قراءة أي ملفات من هذا الفولدر.', true);
                return;
            }

            const jsons = files.filter(f => f.name.toLowerCase().endsWith('.json'));
            const images = files.filter(f => f.name.match(/\.(jpg|jpeg|png|webp)$/i));

            if (jsons.length === 0 || images.length === 0) {
                showScreenStatus('<i class="fa-solid fa-file-circle-xmark"></i>', 'محتوى غير مطابق', `الفولدر يحتوي على ${files.length} ملف، ولكن لم نجد (ملفات JSON وصور) معاً.`, true);
                return;
            }

            folderPairs = [];
            jsons.forEach(jsonFile => {
                let baseName = jsonFile.name.replace(/\.[^/.]+$/, "");
                let matchedImg = images.find(img => img.name.replace(/\.[^/.]+$/, "") === baseName) || 
                                 images.find(img => baseName.includes(img.name.replace(/\.[^/.]+$/, "")) \vert{}\vert{} img.name.replace(/\.[^/.]+$/, "").includes(baseName));
                if(matchedImg) folderPairs.push({ json: jsonFile, image: matchedImg, name: baseName });
            });

            if(folderPairs.length === 0) {
                showScreenStatus('<i class="fa-solid fa-link-slash"></i>', 'فشل الربط', `الفولدر يحتوي على ${jsons.length} ملف JSON و ${images.length} صورة، ولكن أسماء الملفات لا تتطابق نهائياً!`, true);
                return;
            }

            folderPairs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            document.getElementById('leftSidebar').classList.remove('hidden');
            document.getElementById('fileExplorerPanel').classList.remove('hidden');
            
            currentPairIndex = 0;
            renderFileList();
            processUpload(folderPairs[0].json, folderPairs[0].image, document.getElementById('triggerFolderBtn'));
        }

        async function processUpload(jsonFile, imgFile, btnElem) {
            // إظهار حالة التحميل للمستخدم لتأكيد أن الزر يعمل
            showScreenStatus('<i class="fa-solid fa-circle-notch fa-spin"></i>', 'جاري الاتصال بالسيرفر...', 'نقوم الآن بإرسال الملفات إلى الباك-إند لمعالجتها، يرجى الانتظار...');
            
            const formData = new FormData();
            formData.append("json_file", jsonFile);
            formData.append("image", imgFile);

            const origHTML = btnElem.innerHTML;
            btnElem.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري التحميل...`;
            btnElem.disabled = true;
            
            try {
                // محاولة الاتصال بالباك-إند
                const res = await fetch("/upload", { method: "POST", body: formData });
                
                let data;
                try {
                    data = await res.json();
                } catch(e) {
                    throw new Error("السيرفر (FastAPI) أرجع خطأ داخلي (Internal Server Error). تأكد من شاشة الـ Terminal الخاصة بالبايثون لرؤية تفاصيل الخطأ.");
                }
                
                if (!res.ok) {
                    throw new Error(data.detail || "السيرفر رفض الطلب لسبب غير معروف.");
                }

                currentIdx = -1; 
                document.getElementById('textEditor').value = "";
                originalJson = data.original_json;
                linesData = data.lines || [];
                buildWordsList();
                filename = data.filename; 
                imageB64 = data.image_b64;

                imgObj.onload = () => {
                    try {
                        const canvas = document.getElementById('imgCanvas');
                        canvas.width = imgObj.width; canvas.height = imgObj.height;
                        canvas.style.display = 'block';
                        fitToScreen();
                        
                        let activeList = document.getElementById('unitSelect').value === 'lines' ? linesData : allWordsData;
                        if (activeList.length > 0) {
                            selectItem(0);
                        } else {
                            drawCanvas();
                            alert("تنبيه: الصورة لا تحتوي على أي سطور نصية أو أن هيكل الـ JSON غير متوافق.");
                        }
                        document.getElementById('uploadHint').style.display = 'none';
                    } catch (err) {
                        showScreenStatus('<i class="fa-solid fa-bug"></i>', 'خطأ برمجي أثناء الرسم', err.message, true);
                    }
                };

                imgObj.onerror = () => {
                    showScreenStatus('<i class="fa-solid fa-image-slash"></i>', 'فشل قراءة الصورة', 'المتصفح لم يتمكن من عرض الصورة. قد يكون الملف تالفاً أو أن صيغته غير مدعومة (مثلاً ملف PDF تم تغيير امتداده).', true);
                };
                
                if (imgFile) imgObj.src = URL.createObjectURL(imgFile);
                else imgObj.src = "data:image/jpeg;base64," + imageB64;

            } catch (e) {
                showScreenStatus('<i class="fa-solid fa-triangle-exclamation"></i>', 'فشل الرفع!', `${e.message}<br><br><b>ملاحظة:</b> إذا لم يكن السيرفر يستجيب، تأكد من تثبيت مكتبة رفع الملفات في بايثون بكتابة الأمر: <br><code class="text-yellow-400 bg-black p-1 rounded mt-2 inline-block">pip install python-multipart</code>`, true);
            }

            btnElem.innerHTML = origHTML; 
            btnElem.disabled = false;
        }

        // --- باقي الدوال (الرسم والتنقل) بدون تغيير ---
        function getPts(obj) {
            if (!obj) return null;
            let c = obj.coordinates || obj.line_coordinates;
            if (!c) return null;
            if (c.upper_left && c.bottom_right) return [ {x: c.upper_left.x, y: c.upper_left.y}, {x: c.bottom_right.x, y: c.upper_left.y}, {x: c.bottom_right.x, y: c.bottom_right.y}, {x: c.upper_left.x, y: c.bottom_right.y} ];
            else if (c.top_left && c.bottom_right) return [ {x: c.top_left[0], y: c.top_left[1]}, {x: c.top_right[0], y: c.top_right[1]}, {x: c.bottom_right[0], y: c.bottom_right[1]}, {x: c.bottom_left[0], y: c.bottom_left[1]} ];
            else if (Array.isArray(c)) {
                if (c.length >= 8) return [{x: c[0], y: c[1]}, {x: c[2], y: c[3]}, {x: c[4], y: c[5]}, {x: c[6], y: c[7]}];
                if (c.length === 4 && typeof c[0] === 'object') return [{x: c[0].x||c[0][0], y: c[0].y||c[0][1]}, {x: c[1].x||c[1][0], y: c[1].y||c[1][1]}, {x: c[2].x||c[2][0], y: c[2].y||c[2][1]}, {x: c[3].x||c[3][0], y: c[3].y||c[3][1]}];
            } else if (typeof c === 'string') {
                let p = c.split(',').map(Number);
                if (p.length >= 8) return [{x: p[0], y: p[1]}, {x: p[2], y: p[3]}, {x: p[4], y: p[5]}, {x: p[6], y: p[7]}];
            }
            return null;
        }

        function updateCropView(pts) {
            if (!pts || !imgObj.src) return;
            const cropCanvas = document.getElementById('cropCanvas');
            const cropCtx = cropCanvas.getContext('2d');
            let x_min = Math.min(...pts.map(p=>p.x)), x_max = Math.max(...pts.map(p=>p.x));
            let y_min = Math.min(...pts.map(p=>p.y)), y_max = Math.max(...pts.map(p=>p.y));
            let pad = 20;
            x_min = Math.max(0, x_min - pad); y_min = Math.max(0, y_min - pad);
            x_max = Math.min(imgObj.width, x_max + pad); y_max = Math.min(imgObj.height, y_max + pad);
            let w = x_max - x_min, h = y_max - y_min;
            if(w <= 0 || h <= 0) return;
            cropCanvas.width = w; cropCanvas.height = h;
            cropCtx.clearRect(0, 0, w, h);
            cropCtx.drawImage(imgObj, x_min, y_min, w, h, 0, 0, w, h);
        }

        function applyZoom() {
            const canvas = document.getElementById('imgCanvas');
            canvas.style.width = (imgObj.width * scale) + 'px';
            canvas.style.height = (imgObj.height * scale) + 'px';
            let zoomLabel = document.getElementById('zoomLevel');
            if(zoomLabel) zoomLabel.innerText = Math.round(scale * 100) + '%';
        }
        
        function fitToScreen() {
            if(!imgObj.src) return;
            const container = document.getElementById('canvasContainer');
            const scaleX = (container.clientWidth - 40) / imgObj.width;
            const scaleY = (container.clientHeight - 40) / imgObj.height;
            scale = Math.floor(Math.min(scaleX, scaleY, 1.0) * 100) / 100;
            if (scale <= 0) scale = 0.1;
            applyZoom();
        }

        function drawCanvas() {
            if (!imgObj.src) return;
            const canvas = document.getElementById('imgCanvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(imgObj, 0, 0);

            let unitMode = document.getElementById('unitSelect').value;
            let boxMode = document.getElementById('boxesSelect').value;
            let textMode = document.getElementById('textSelect').value;
            let activeList = unitMode === 'lines' ? linesData : allWordsData;

            if (boxMode === 'all') {
                ctx.lineWidth = 1.5;
                activeList.forEach((item, idx) => {
                    if (idx === currentIdx) return; 
                    let pts = getPts(unitMode === 'lines' ? item : item.ref);
                    if (pts) {
                        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                        for(let i=1; i<4; i++) ctx.lineTo(pts[i].x, pts[i].y);
                        ctx.closePath();
                        ctx.strokeStyle = unitMode === 'lines' ? "rgba(59, 130, 246, 0.6)" : "rgba(217, 119, 6, 0.6)"; 
                        ctx.fillStyle = unitMode === 'lines' ? "rgba(59, 130, 246, 0.1)" : "rgba(217, 119, 6, 0.1)";
                        ctx.fill(); ctx.stroke();
                    }
                });
            }

            ctx.fillStyle = `rgba(15, 23, 42, ${document.getElementById('dimSlider').value})`; 
            if (currentIdx >= 0 && currentIdx < activeList.length && boxMode !== 'none') {
                let pts = getPts(unitMode === 'lines' ? activeList[currentIdx] : activeList[currentIdx].ref);
                if (pts) {
                    ctx.beginPath(); ctx.rect(0, 0, canvas.width, canvas.height);
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for(let i=1; i<4; i++) ctx.lineTo(pts[i].x, pts[i].y);
                    ctx.closePath(); ctx.fill('evenodd'); 
                    ctx.lineWidth = 3; ctx.strokeStyle = "#10b981"; 
                    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                    for(let i=1; i<4; i++) ctx.lineTo(pts[i].x, pts[i].y);
                    ctx.closePath(); ctx.stroke();
                }
            } else { ctx.fillRect(0, 0, canvas.width, canvas.height); }

            if (textMode !== 'off') {
                ctx.font = 'bold 16px "Cairo", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.direction = 'rtl'; 
                activeList.forEach((item, idx) => {
                    if (textMode === 'selected' && idx !== currentIdx) return;
                    let pts = getPts(unitMode === 'lines' ? item : item.ref);
                    let txt = (unitMode === 'lines' ? item.text : item.ref.text) || '';
                    if (pts && txt.trim() !== '') {
                        let x_min = Math.min(...pts.map(p=>p.x)), x_max = Math.max(...pts.map(p=>p.x));
                        let y_min = Math.min(...pts.map(p=>p.y));
                        let centerX = x_min + (x_max - x_min) / 2;
                        let textWidth = ctx.measureText(txt).width;
                        let padX = 8, padY = 4, bgH = 24, bgY = y_min - bgH - 4;
                        if (bgY < 0) bgY = y_min + 4 + (pts[2].y - pts[0].y); 
                        ctx.fillStyle = (idx === currentIdx) ? 'rgba(16, 185, 129, 0.9)' : 'rgba(15, 23, 42, 0.85)';
                        ctx.beginPath();
                        if(ctx.roundRect) ctx.roundRect(centerX - textWidth/2 - padX, bgY, textWidth + padX*2, bgH, 4);
                        else ctx.fillRect(centerX - textWidth/2 - padX, bgY, textWidth + padX*2, bgH);
                        ctx.fill();
                        ctx.fillStyle = (idx === currentIdx) ? '#ffffff' : '#fbbf24'; 
                        ctx.fillText(txt, centerX, bgY + bgH - padY);
                    }
                });
            }
        }

        function selectItem(idx) {
            let unitMode = document.getElementById('unitSelect').value;
            let activeList = unitMode === 'lines' ? linesData : allWordsData;
            if (idx < 0 || idx >= activeList.length) return;
            
            currentIdx = idx;
            document.getElementById('lineCounter').innerText = `${currentIdx + 1} / ${activeList.length}`;
            
            let item = activeList[currentIdx];
            const textEditor = document.getElementById('textEditor');
            textEditor.value = unitMode === 'lines' ? item.text : item.ref.text;
            textEditor.style.height = 'auto'; textEditor.style.height = textEditor.scrollHeight + 'px';
            
            drawCanvas();
            let pts = getPts(unitMode === 'lines' ? item : item.ref);
            if(pts) {
                updateCropView(pts);
                const container = document.getElementById('canvasContainer');
                const targetY = (pts[0].y * scale) - (container.clientHeight / 2);
                const targetX = (pts[0].x * scale) - (container.clientWidth / 2);
                container.scrollTo({ top: Math.max(0, targetY), left: Math.max(0, targetX), behavior: 'smooth' });
            }
        }

        function buildWordsList() {
            allWordsData = [];
            if(!linesData) return;
            linesData.forEach((line, lIdx) => {
                if(line.words && line.words.length > 0) {
                    line.words.forEach((w, wIdx) => { allWordsData.push({ lineIdx: lIdx, wordIdx: wIdx, ref: w }); });
                } else {
                    allWordsData.push({ lineIdx: lIdx, wordIdx: 0, ref: { text: line.text, coordinates: line.coordinates || line.line_coordinates, isVirtual: true } });
                }
            });
        }

        function renderFileList() {
            const list = document.getElementById('fileList');
            list.innerHTML = '';
            const issueText = document.getElementById('issueFilter').value.toLowerCase();
            let filteredPairs = folderPairs.filter(pair => (!issueText || pair.name.toLowerCase().includes(issueText)));
            
            document.getElementById('fileCountBadge').innerText = filteredPairs.length;
            filteredPairs.forEach((pair) => {
                const idx = folderPairs.indexOf(pair);
                const isActive = (idx === currentPairIndex);
                const div = document.createElement('div');
                div.className = `group flex items-center justify-between p-2.5 rounded-lg cursor-pointer mb-1.5 transition-all duration-200 border ${isActive ? 'bg-blue-600 border-blue-500 shadow-md' : 'bg-[#1e293b] border-transparent hover:bg-[#334155] hover:border-[#475569]'}`;
                div.innerHTML = `<div class="flex items-center gap-3 overflow-hidden" dir="ltr"><div class="shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${isActive ? 'bg-white/20 text-white' : 'bg-[#0f172a] text-slate-400 group-hover:text-blue-400'}"><i class="fa-solid fa-file-code text-xs"></i></div><div class="flex flex-col truncate"><span class="text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-slate-300'}">${pair.name}</span><span class="text-[9px] truncate ${isActive ? 'text-blue-200' : 'text-slate-500'}">JSON + Image</span></div></div>${isActive ? '<div class="shrink-0 w-2 h-2 rounded-full bg-white shadow animate-pulse ml-2"></div>' : ''}`;
                div.onclick = () => { currentPairIndex = idx; renderFileList(); processUpload(folderPairs[idx].json, folderPairs[idx].image, document.getElementById('triggerFolderBtn')); };
                list.appendChild(div);
            });
        }

        function unitChanged() {
            let activeList = document.getElementById('unitSelect').value === 'lines' ? linesData : allWordsData;
            if(activeList.length > 0) selectItem(0);
        }

        async function saveData() {
            const saveDir = document.getElementById('saveDir').value;
            if(!saveDir) return alert("الرجاء كتابة مسار الفولدر للحفظ.");
            localStorage.setItem('lastSaveDir', saveDir);

            const btn = document.getElementById('saveBtn');
            const originalContent = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> جاري المعالجة...`;
            btn.disabled = true;

            const formData = new FormData();
            formData.append("filename", filename);
            formData.append("original_json", JSON.stringify(originalJson));
            formData.append("lines_json", JSON.stringify(linesData));
            formData.append("save_dir", saveDir);
            formData.append("image_b64", imageB64);

            try {
                const res = await fetch("/save", { method: "POST", body: formData });
                const data = await res.json();
                if (res.ok) alert("تم الحفظ بنجاح!");
                else alert("فشل الحفظ: " + data.detail);
            } catch (e) { alert("خطأ في الاتصال: " + e.message); }
            
            btn.innerHTML = originalContent; btn.disabled = false;
        }

        document.getElementById('textEditor').addEventListener('input', (e) => {
            let unitMode = document.getElementById('unitSelect').value;
            let activeList = unitMode === 'lines' ? linesData : allWordsData;
            if(currentIdx < 0 || currentIdx >= activeList.length) return;
            
            let val = e.target.value;
            if (unitMode === 'lines') linesData[currentIdx].text = val;
            else {
                let wItem = allWordsData[currentIdx];
                wItem.ref.text = val;
                let parentLine = linesData[wItem.lineIdx];
                if(wItem.ref.isVirtual) parentLine.text = val;
                else parentLine.text = parentLine.words.map(w => w.text).join(' ');
            }
            e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px';
            if (document.getElementById('textSelect').value !== 'off') drawCanvas(); 
        });

        document.getElementById('imgCanvas').addEventListener('mousedown', (e) => {
            const canvas = document.getElementById('imgCanvas');
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            let unitMode = document.getElementById('unitSelect').value;
            let activeList = unitMode === 'lines' ? linesData : allWordsData;

            for (let i=0; i<activeList.length; i++) {
                let pts = getPts(unitMode === 'lines' ? activeList[i] : activeList[i].ref);
                if (pts && x >= pts[0].x && x <= pts[1].x && y >= pts[0].y && y <= pts[2].y) { selectItem(i); break; }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (document.activeElement !== document.getElementById('textEditor') || e.altKey) {
                if (e.key === "ArrowDown" || e.key === "ArrowLeft") { selectItem(currentIdx + 1); e.preventDefault(); }
                if (e.key === "ArrowUp" || e.key === "ArrowRight") { selectItem(currentIdx - 1); e.preventDefault(); }
            }
        });
    