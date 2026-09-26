const STORAGE_KEY = 'zmrobo_system_models_v1';

    // ==============================================================
    // 1. HỆ THỐNG LƯU TRỮ VÀ KHÔI PHỤC MODEL VĨNH VIỄN (LOCALSTORAGE)
    // ==============================================================
    function saveModelToSystem(partId, cleanName, holesCount, thumbnailData, glbBuffer) {
      const blob = new Blob([glbBuffer]);
      const reader = new FileReader();
      
      reader.onload = function(e) {
        const base64Glb = e.target.result;
        const newItem = {
          id: partId,
          name: cleanName,
          holesCount: holesCount,
          thumbnail: thumbnailData,
          glbData: base64Glb,
          timestamp: Date.now()
        };

        try {
          let savedModels = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
          if (!savedModels.some(m => m.id === partId)) {
            savedModels.push(newItem);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(savedModels));
          }
        } catch (error) {
          console.error("Lỗi lưu trữ:", error);
          if (typeof showToast === 'function') {
            showToast("Không thể lưu vĩnh viễn: Dung lượng model quá lớn (>5MB)!", "error");
          }
        }
      };
      reader.readAsDataURL(blob);
    }

    function loadSystemModelsOnStartup() {
      try {
        const savedData = localStorage.getItem(STORAGE_KEY);
        if (!savedData) return;
        
        const savedModels = JSON.parse(savedData);
        if (!Array.isArray(savedModels) || savedModels.length === 0) return;

        savedModels.forEach(savedItem => {
          if (savedItem.glbData) {
            // Kiểm tra xem model này đã có trong customInventory chưa, có rồi thì bỏ qua
            if (typeof customInventory !== 'undefined' && customInventory.some(i => i.id === savedItem.id)) {
              return;
            }

            const binaryString = atob(savedItem.glbData.split(',')[1]);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Gọi lại hàm import với cờ isRestoring = true để hiển thị lên thẻ UI
            if (typeof parseGLBBuffer === 'function') {
              parseGLBBuffer(bytes.buffer, savedItem.name + '.glb', { 
                isRestoring: true, 
                originalId: savedItem.id, 
                thumbnail: savedItem.thumbnail 
              });
            }
          }
        });
      } catch (error) {
        console.error("Lỗi khi tải lại kho model hệ thống:", error);
      }
    }

    // Tự động khôi phục dữ liệu ngay khi load trang
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        loadSystemModelsOnStartup();
      }, 300);
    });

    // ==============================================================
    // 2. CÁC HÀM XỬ LÝ GIAO DIỆN & KÉO THẢ NHẬP FILE
    // ==============================================================
    function setupDragDrop() {
      const container = document.getElementById('canvas-container');
      const overlay = document.getElementById('glb-drop-overlay');

      container.addEventListener('dragover', (e) => { e.preventDefault(); overlay.classList.remove('hidden'); });
      container.addEventListener('dragleave', (e) => { e.preventDefault(); if (!container.contains(e.relatedTarget)) overlay.classList.add('hidden'); });
      container.addEventListener('drop', (e) => {
        e.preventDefault();
        overlay.classList.add('hidden');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleGLBFileInput(e.dataTransfer.files[0]);
        }
      });
    }

    function setupFileInputs() {
      const modelInput = document.getElementById('model-file-input');
      const projectInput = document.getElementById('project-file-input');

      if (modelInput) {
        modelInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) handleGLBFileInput(e.target.files[0]);
        });
      }
      if (projectInput) {
        projectInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) loadProjectFile(e.target.files[0]);
        });
      }
    }

    function setupMobileSidebar() {
      const toggleBtn = document.getElementById('mobile-toggle-btn');
      const sidebar = document.getElementById('sidebar');
      if (!toggleBtn || !sidebar) return;

      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
        sidebar.classList.toggle('md:flex', !sidebar.classList.contains('hidden'));
      });
    }

    function handleGLBFileInput(file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        parseGLBBuffer(evt.target.result, file.name);
      };
      reader.readAsArrayBuffer(file);
    }

    // ==============================================================
    // 3. TẠO THUMBNAIL (ẢNH THU NHỎ) TỪ MODEL 3D
    // ==============================================================
    function generateGLBThumbnail(object3D) {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 120;
      
      const thumbRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      thumbRenderer.setSize(120, 120);

      const thumbScene = new THREE.Scene();
      const thumbCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      thumbScene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
      dirLight.position.set(5, 10, 7);
      thumbScene.add(dirLight);

      const modelClone = object3D.clone();
      thumbScene.add(modelClone);

      const box = new THREE.Box3().setFromObject(modelClone);
      const center = new THREE.Vector3();
      box.getCenter(center);
      modelClone.position.sub(center); 

      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      thumbCamera.position.set(maxDim * 2.0, maxDim * 1.5, maxDim * 2.0);
      thumbCamera.lookAt(0, 0, 0);

      thumbRenderer.render(thumbScene, thumbCamera);
      const dataURL = canvas.toDataURL('image/png');
      thumbRenderer.dispose();
      return dataURL;
    }

    // ==============================================================
    // 4. BỘ XỬ LÝ MODEL (GLB PARSER) & KẾT NỐI DANH SÁCH MENU UI
    // ==============================================================
    function parseGLBBuffer(buffer, fileName, options = {}) {
      const loader = new THREE.GLTFLoader();
      loader.parse(buffer, '', (gltf) => {
        const root = gltf.scene || gltf.scenes[0];
        const detectedHoles = [];
        const garbage = [];

        root.traverse(child => {
          if (child.isCamera || child.isLight) garbage.push(child);
          if (child.isMesh && child.geometry) {
            child.geometry.computeBoundingBox();
            const sz = new THREE.Vector3();
            child.geometry.boundingBox.getSize(sz);
            if (sz.x > 500 || sz.y > 500 || sz.z > 500) garbage.push(child);
          }
        });
        garbage.forEach(g => { if (g.parent) g.parent.remove(g); });

        if (root.userData && root.userData.zmroboMetadata && Array.isArray(root.userData.zmroboMetadata.holes)) {
          detectedHoles.push(...root.userData.zmroboMetadata.holes);
        }

        root.traverse((child) => {
          if (child.name && (child.name.startsWith('SOCKET_HOLE_') || child.name.startsWith('socket_') || child.name.startsWith('hole_'))) {
            const partsName = child.name.split('_');
            const dir = (partsName.includes('H') || partsName.includes('h')) ? 'horizontal' : 'vertical';
            const numPart = partsName.find(p => !isNaN(parseInt(p, 10)));
            const index = numPart ? parseInt(numPart, 10) : (detectedHoles.length + 1);
            child.userData = { isSocketNode: true, index: index, type: dir };

            if (!detectedHoles.some(h => h.index === index && h.dir === dir)) {
              detectedHoles.push({ index, x: child.position.x, y: child.position.y, z: child.position.z, dir, desc: child.userData.desc || `Lỗ #${index}` });
            }
          }
          if (child.isMesh && child.material) {
            child.material.roughness = Math.max(child.material.roughness || 0.72, 0.72);
            child.material.metalness = 0.0;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        detectedHoles.sort((a, b) => a.index - b.index);

        const badgeGroup = new THREE.Group();
        badgeGroup.name = "badges";
        detectedHoles.forEach(h => {
          const isH = (h.dir === 'horizontal');
          const badge = createHoleBadgeSprite(h.index, isH);
          badge.position.set(h.x, h.y + (isH ? 0.08 : 0.22), h.z + (isH ? 0.24 : 0));
          badgeGroup.add(badge);
        });
        root.add(badgeGroup);

        const cleanName = fileName.replace(/\.[^/.]+$/, "");
        const partId = options.originalId || 'glb_' + Date.now();
        root.userData = { id: partId, name: cleanName, holes: detectedHoles, isCustomPart: true };

        // Chỉ đưa vào 3D Scene khi người dùng chủ động Add (Không add khi F5 restore)
        if (!options.isRestoring) {
          scene.add(root);
          parts.push(root);
          if (typeof placePartOnGround === 'function') placePartOnGround(root);
          if (typeof placeNewPartInEmptySpace === 'function') placeNewPartInEmptySpace(root);
          selectPart(root);
          updatePartsCount();
          fitCameraToParts([root]);
          recordHistoryState();
        }

        // Tái sử dụng thumbnail từ storage (đỡ lag) hoặc tạo mới nếu là import thủ công
        const thumbnailData = options.thumbnail || generateGLBThumbnail(root);

        // Đăng ký trực tiếp vào thẻ UI (Luôn chạy để hiển thị ra danh sách)
        registerCustomInventoryItem({
          id: partId,
          name: cleanName,
          holesCount: detectedHoles.length,
          modelScene: root.clone(),
          thumbnail: thumbnailData 
        });

        // Chỉ lưu xuống bộ nhớ LocalStorage nếu đây là file mới được nhập tay vào
        if (!options.isRestoring) {
          saveModelToSystem(partId, cleanName, detectedHoles.length, thumbnailData, buffer);
          showToast(`Đã nhập "${cleanName}" (${detectedHoles.length} Sockets)`);
        }
      }, (err) => {
        console.error(err);
        if (!options.isRestoring) showToast("Không thể giải mã tệp .GLB!", "error");
      });
    }

    function registerCustomInventoryItem(item) {
      if (typeof customInventory === 'undefined') window.customInventory = [];
      
      // Chặn duplicate: Tránh đăng ký 2 lần nếu thẻ bài đã tồn tại trên màn hình
      if (customInventory.some(i => i.id === item.id)) return;

      customInventory.push(item);
      const countEl = document.getElementById('custom-inventory-count');
      if (countEl) countEl.textContent = `${customInventory.length} model`;
      
      const emptyMsg = document.getElementById('empty-inventory-msg');
      if (emptyMsg) emptyMsg.classList.add('hidden');

      const list = document.getElementById('custom-inventory-list');
      if (!list) return;

      const card = document.createElement('div');
      card.className = 'p-2 rounded-xl border border-cyan-500/40 bg-slate-900 flex items-center justify-between gap-2 mb-2';
      card.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <img src="${item.thumbnail || ''}" class="w-10 h-10 object-cover rounded-md border border-slate-700 bg-slate-950 flex-shrink-0" alt="Thumb">
          <div class="min-w-0 pr-2">
            <p class="text-xs font-bold text-cyan-300 truncate">${item.name}</p>
            <p class="text-[10px] text-slate-400 font-mono">${item.holesCount} Sockets</p>
          </div>
        </div>
        <button onclick="spawnFromCustomInventory('${item.id}')" class="px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold hover:bg-cyan-400 transition-colors flex-shrink-0">Thêm</button>
      `;
      list.appendChild(card);
    }

    function spawnFromCustomInventory(id) {
      const item = customInventory.find(x => x.id === id);
      if (!item) return;
      
      const clone = item.modelScene.clone();
      clone.position.set(0, 0, 0); 
      clone.userData.id = 'glb_' + Date.now();
      
      scene.add(clone);
      parts.push(clone);

      if (typeof placePartOnGround === 'function') placePartOnGround(clone);
      if (typeof placeNewPartInEmptySpace === 'function') placeNewPartInEmptySpace(clone);

      selectPart(clone);
      updatePartsCount();
      recordHistoryState();
      showToast(`Đã thêm bản sao "${item.name}"`);
    }

    // ==============================================================
    // 5. EXPORT XUẤT FILE GLB
    // ==============================================================
    function exportToGLB(selectedOnly = false) {
      if (selectedOnly && !selectedPart) {
        showToast("Vui lòng chọn một linh kiện để xuất GLB riêng!", "error");
        return;
      }
      const exportGroup = new THREE.Group();
      exportGroup.name = "ZMROBO_EXPORT_ROOT";
      const partsToExport = selectedOnly ? [selectedPart] : parts;
      if (partsToExport.length === 0) {
        showToast("Không có linh kiện nào để xuất!", "error");
        return;
      }

      partsToExport.forEach(part => {
        const clonedPart = part.clone();
        const badge = clonedPart.getObjectByName("badges");
        if (badge) clonedPart.remove(badge);

        const holes = part.userData.holes || [];
        const socketGroup = new THREE.Group();
        socketGroup.name = "ZMROBO_SOCKETS";

        holes.forEach(h => {
          const anchor = new THREE.Object3D();
          const dirCode = (h.dir === 'horizontal') ? 'H' : 'V';
          anchor.name = `SOCKET_HOLE_${dirCode}_${h.index}`;
          anchor.position.set(h.x, h.y, h.z);
          anchor.userData = { index: h.index, type: h.dir, desc: h.desc };
          socketGroup.add(anchor);
        });
        clonedPart.add(socketGroup);

        clonedPart.userData.zmroboMetadata = { version: "1.0", holes: holes };
        exportGroup.add(clonedPart);
      });

      const exporter = new THREE.GLTFExporter();
      exporter.parse(exportGroup, (gltfData) => {
        const blob = new Blob([gltfData], { type: 'model/gltf-binary' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const fileName = selectedOnly ? `${selectedPart.userData.name || 'linh_kien'}_sockets.glb` : `lap_ghep_zmrobo_${Date.now()}.glb`;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast(`Đã xuất file ${fileName}`);
      }, { binary: true });
    }