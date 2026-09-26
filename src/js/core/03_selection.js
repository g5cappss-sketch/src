// --- HỆ THỐNG RAYCASTER VÀ TƯƠNG TÁC CHUỘT (ĐÃ KHÓA KHI Ở CHẾ ĐỘ REVIEW / EXPLODE) ---
    function setupRaycaster() {
      const canvas = document.getElementById('webgl-canvas');
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      const dragPlane = new THREE.Plane();
      const dragPoint = new THREE.Vector3();
      const dragOffset = new THREE.Vector3();
      let isDirectDragging = false;
      let dragStartPosition = null;
      let collisionWasBlocked = false;

      function updatePointer(event) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      }

      function startDirectDrag(part, event) {
        if (isExploded) return false; // <--- KHÓA: Không cho kéo thả trực tiếp khi đang ở chế độ Review
        if (toolMode !== 'select' || part !== selectedPart || pickJoinMode) return false;

        updatePointer(event);
        raycaster.setFromCamera(mouse, camera);
        const worldPosition = part.getWorldPosition(new THREE.Vector3());
        dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), worldPosition);
        if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return false;

        dragOffset.copy(worldPosition).sub(dragPoint);
        dragStartPosition = part.position.clone();
        collisionWasBlocked = false;
        part.userData.liftedAboveAssembly = false;
        part.userData.magneticReleaseParts = getMagneticPartners(part);
        part.userData.magneticReleaseOrigin = worldPosition.clone();
        detachMagneticJoints(part);
        part.userData.magneticSnapped = false;
        isDirectDragging = true;
        controls.enabled = false;
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = 'grabbing';
        part.userData.safeTransform = {
          position: part.position.clone(),
          quaternion: part.quaternion.clone(),
          scale: part.scale.clone()
        };
        return true;
      }

      canvas.addEventListener('pointermove', (event) => {
        if (isExploded) return; // <--- KHÓA: Chặn dịch chuyển khi đang explode
        if (!isDirectDragging || !selectedPart) return;

        updatePointer(event);
        raycaster.setFromCamera(mouse, camera);
        if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;

        const nextWorldPosition = dragPoint.clone().add(dragOffset);
        const previousPosition = selectedPart.position.clone();
        if (selectedPart.parent) {
          selectedPart.position.copy(selectedPart.parent.worldToLocal(nextWorldPosition));
        } else {
          selectedPart.position.copy(nextWorldPosition);
        }
        clampPartToGround(selectedPart);

        if (selectedPart.userData.isPin) {
          const snap = findNearestPinSnap(selectedPart, 2.25);
          if (snap) {
            snapPinToHole(selectedPart, snap);
            collisionWasBlocked = false;
            return;
          }
          if (selectedPart.userData.magneticSnapped) detachMagneticJoints(selectedPart);
        } else {
          snapPartPositionToGrid(selectedPart);
          const snap = findNearestComponentSnap(selectedPart, 2.25);
          if (snap) {
            snapComponentToPin(selectedPart, snap);
            collisionWasBlocked = false;
            return;
          }
          if (selectedPart.userData.magneticSnapped) detachMagneticJoints(selectedPart);
        }

        if (!selectedPart.userData.magneticSnapped && hasPartCollision(selectedPart, null, true)) {
          if (!liftPartAboveOverlappingAssembly(selectedPart)) {
            selectedPart.position.copy(previousPosition);
            if (!collisionWasBlocked) {
              showToast('Không thể di chuyển xuyên qua linh kiện khác', 'error');
              collisionWasBlocked = true;
            }
          } else {
            collisionWasBlocked = false;
          }
        } else {
          collisionWasBlocked = false;
        }
      });

      canvas.addEventListener('pointerup', (event) => {
        if (isExploded) return; // <--- KHÓA: Chặn sự kiện nhả chuột khi đang explode
        if (!isDirectDragging || !selectedPart) return;

        isDirectDragging = false;
        controls.enabled = true;
        canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = '';

        if (!selectedPart.userData.magneticSnapped && hasPartCollision(selectedPart, null, true)) {
          selectedPart.position.copy(dragStartPosition);
          showToast('Không thể di chuyển xuyên qua linh kiện khác', 'error');
        } else if (!selectedPart.userData.liftedAboveAssembly) {
          settleAssemblyOnGround(selectedPart);
          recordHistoryState();
        } else {
          recordHistoryState();
        }
        selectedPart.userData.liftedAboveAssembly = false;
        dragStartPosition = null;
        collisionWasBlocked = false;
      });

      canvas.addEventListener('pointerdown', (e) => {
        if (isExploded) return; // <--- KHÓA QUAN TRỌNG: Chặn hoàn toàn thao tác click chọn vật thể khi đang ở chế độ Review (Explode)
        if (transformControls.dragging) return;

        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(parts, true);

        if (intersects.length > 0) {
          const hitObj = intersects[0].object;

          let foundSocket = null;
          let temp = hitObj;
          while (temp && temp.parent) {
            if (temp.userData && temp.userData.isSocketNode) {
              foundSocket = temp.userData;
              break;
            }
            temp = temp.parent;
          }

          let targetPart = null;
          temp = hitObj;
          while (temp) {
            if (parts.includes(temp)) {
              targetPart = temp;
              break;
            }
            temp = temp.parent;
          }

          if (targetPart) {
            if (pickJoinMode === 'first') {
              pickedFirstPart = targetPart;
              updateJoinWizardUI();
              cancelSnapMode();
              showToast(`Đã chọn Đối tượng 1: ${targetPart.userData.name}`);
            } else if (pickJoinMode === 'second') {
              pickedSecondPart = targetPart;
              updateJoinWizardUI();
              cancelSnapMode();
              showToast(`Đã chọn Đối tượng 2: ${targetPart.userData.name}`);
            } else {
              const wasAlreadySelected = targetPart === selectedPart;
              selectPart(targetPart);
              if (foundSocket) {
                showToast(`Đã chọn Lỗ #${foundSocket.index} trên ${targetPart.userData.name}`);
              }
              if (wasAlreadySelected) startDirectDrag(targetPart, e);
            }
            return;
          }
        }

        if (!pickJoinMode && toolMode === 'select') {
          selectPart(null);
        }
      });
    }

    // --- HỆ THỐNG SELECTION & QUẢN LÝ GIAO DIỆN LINH KIỆN ---
    function selectPart(part) {
      selectedPart = part;
      const hud = document.getElementById('floating-part-hud');
      const noSelect = document.getElementById('inspector-no-selection');
      const activePanel = document.getElementById('inspector-active-panel');
      const appearanceControls = document.getElementById('appearance-controls');
      const btnDeselect = document.getElementById('btn-tool-deselect');

      updateBadgesVisibility();
      updateCanvasPartsListUI();

      if (part) {
        document.getElementById('floating-part-name').innerText = part.userData.name;
        hud.classList.remove('hidden');
        if (btnDeselect) btnDeselect.classList.remove('hidden');
        noSelect.classList.add('hidden');
        activePanel.classList.remove('hidden');
        appearanceControls.classList.remove('hidden');

        document.getElementById('inspect-part-title').innerText = part.userData.name;
        document.getElementById('inspect-part-id').innerText = `ID: ${part.userData.id}`;
        document.getElementById('inspect-sockets-count').innerText = (part.userData.holes || []).length;

        if (toolMode !== 'select') {
          transformControls.attach(part);
          transformControls.setMode(toolMode === 'rotate' ? 'rotate' : 'translate');
        } else {
          transformControls.detach();
        }
      } else {
        hud.classList.add('hidden');
        if (btnDeselect) btnDeselect.classList.add('hidden');
        noSelect.classList.remove('hidden');
        activePanel.classList.add('hidden');
        appearanceControls.classList.add('hidden');
        transformControls.detach();
      }
    }

    function updateCanvasPartsListUI() {
      const list = document.getElementById('canvas-parts-list');
      const countBadge = document.getElementById('canvas-parts-list-count');
      if (!list) return;

      countBadge.textContent = parts.length;
      list.innerHTML = '';

      if (parts.length === 0) {
        list.innerHTML = '<div class="text-[10px] text-slate-500 py-1 text-center">Chưa có linh kiện nào trên Canvas</div>';
        return;
      }

      parts.forEach(p => {
        const isSel = (p === selectedPart);
        const item = document.createElement('div');
        item.className = `p-2 rounded-lg flex items-center justify-between transition-all cursor-pointer ${
          isSel ? 'bg-cyan-950/60 border border-cyan-400 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700'
        }`;
        item.innerHTML = `
          <div class="min-w-0 pr-2 flex items-center gap-2" onclick="selectPartById('${p.userData.id}')">
            <div class="w-2 h-2 rounded-full ${isSel ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'}"></div>
            <div class="truncate text-xs font-semibold">${p.userData.name}</div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="focusPartById('${p.userData.id}')" class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400" title="Căn góc nhìn vào chi tiết này">
              <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="deletePartById('${p.userData.id}')" class="p-1 rounded hover:bg-rose-950 text-slate-500 hover:text-rose-400" title="Xóa chi tiết này">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `;
        list.appendChild(item);
      });

      if (window.lucide) window.lucide.createIcons();
    }

    function selectPartById(id) {
      const part = parts.find(p => p.userData.id === id);
      if (part) {
        selectPart(part);
        showToast(`Đã chọn "${part.userData.name}"`);
      }
    }

    function focusPartById(id) {
      const part = parts.find(p => p.userData.id === id);
      if (part) {
        selectPart(part);
        focusCurrentSelected();
      }
    }

    function deletePartById(id) {
      const part = parts.find(p => p.userData.id === id);
      if (part) {
        if (selectedPart === part) selectPart(null);
        scene.remove(part);
        parts = parts.filter(p => p !== part);
        joints = joints.filter(j => j.partA !== part && j.partB !== part);
        if (pickedFirstPart === part) pickedFirstPart = null;
        if (pickedSecondPart === part) pickedSecondPart = null;
        updateJoinWizardUI();
        updateJointsUI();
        updatePartsCount();
        recordHistoryState();
        showToast(`Đã xóa "${part.userData.name}"`);
      }
    }

    function focusCurrentSelected() {
      if (selectedPart) {
        fitCameraToParts([selectedPart]);
        showToast(`Đã căn góc nhìn vào "${selectedPart.userData.name}"`);
      } else if (parts.length > 0) {
        fitCameraToParts(parts);
        showToast("Đã căn góc nhìn toàn bộ linh kiện");
      }
    }