    function getNonOverlapJoinOffset(partA, partB, h1, h2) {
      if (h1.dir !== h2.dir) return new THREE.Vector3();

      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(partA.quaternion);
      const spacing = partB.userData?.isPin ? 0.75 : 1.8;
      return axis.multiplyScalar(spacing);
    }

    function executeSocketJoin() {
      if (!pickedFirstPart || !pickedSecondPart) {
        showToast("Vui lòng chọn đủ 2 đối tượng trong tab 'Ghép 2' trước!", "error");
        return;
      }
      const idx1 = parseInt(document.getElementById('join-socket-first').value, 10);
      const idx2 = parseInt(document.getElementById('join-socket-second').value, 10);

      const h1 = (pickedFirstPart.userData.holes || []).find(h => h.index === idx1);
      const h2 = (pickedSecondPart.userData.holes || []).find(h => h.index === idx2);

      if (!h1 || !h2) {
        showToast("Vui lòng chọn lỗ hợp lệ trên cả 2 đối tượng!", "error");
        return;
      }

      pickedFirstPart.updateMatrixWorld(true);
      pickedSecondPart.updateMatrixWorld(true);

      const p1World = new THREE.Vector3(h1.x, h1.y, h1.z).applyMatrix4(pickedFirstPart.matrixWorld);
      const secondCenterWorld = pickedSecondPart.getWorldPosition(new THREE.Vector3());
      const h2World = new THREE.Vector3(h2.x, h2.y, h2.z).applyMatrix4(pickedSecondPart.matrixWorld);
      const delta = h2World.clone().sub(secondCenterWorld);

      const sameAxisJoin = h1.dir === h2.dir && Math.abs(h1.y - h2.y) < 0.05 && Math.abs(h1.z - h2.z) < 0.05;
      pickedSecondPart.quaternion.copy(pickedFirstPart.quaternion);

      if (sameAxisJoin) {
        const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(pickedFirstPart.quaternion);
        const secondPartThickness = Math.max(0.01, Math.abs(h2.y) * 2);
        const targetHoleWorld = p1World.clone().add(worldUp.clone().multiplyScalar(secondPartThickness));
        const h2LocalRotated = new THREE.Vector3(h2.x, h2.y, h2.z).applyQuaternion(pickedSecondPart.quaternion);
        pickedSecondPart.position.copy(targetHoleWorld).sub(h2LocalRotated);

        let safety = 0;
        while (hasPartCollision(pickedSecondPart, pickedFirstPart) && safety < 20) {
          pickedSecondPart.position.add(worldUp.clone().multiplyScalar(0.3));
          pickedSecondPart.updateMatrixWorld(true);
          safety += 1;
        }
      } else {
        const secondCenterWorld = pickedSecondPart.getWorldPosition(new THREE.Vector3());
        const delta = h2World.clone().sub(secondCenterWorld);
        pickedSecondPart.position.copy(p1World).sub(delta);
      }

      pickedSecondPart.updateMatrixWorld(true);
      clampPartToGround(pickedSecondPart);

      const finalP1World = new THREE.Vector3(h1.x, h1.y, h1.z).applyMatrix4(pickedFirstPart.matrixWorld);
      const pinCount = joints.filter(j => j.partA === pickedFirstPart || j.partB === pickedFirstPart || j.partA === pickedSecondPart || j.partB === pickedSecondPart).length;
      let jointPin = null;
      if (pinCount < 1) {
        jointPin = spawnStandalonePin(0x38bdf8, { skipHistory: true, skipSelect: true });
        jointPin.quaternion.copy(pickedFirstPart.quaternion);
        jointPin.position.copy(finalP1World);
        jointPin.userData.name = `Chốt ghép ${pickedFirstPart.userData.name} ↔ ${pickedSecondPart.userData.name}`;
        jointPin.userData.isJoinPin = true;
        jointPin.userData.joinedParts = [pickedFirstPart, pickedSecondPart];
      }

      const jointId = 'joint_' + Date.now();
      joints.push({ id: jointId, partA: pickedFirstPart, partB: pickedSecondPart, socketA: h1, socketB: h2, pin: jointPin || null });

      settleAssemblyOnGround(pickedFirstPart);
      updateJointsUI();
      recordHistoryState();
      showToast(`Đã ghép Lỗ #${h1.index} với Lỗ #${h2.index}`);
      selectPart(pickedSecondPart);
    }

    function updateJointsUI() {
      document.getElementById('count-joints').textContent = joints.length;
      const container = document.getElementById('joints-list-container');
      const emptyMsg = document.getElementById('joints-empty-msg');
      container.innerHTML = '';

      if (joints.length === 0) {
        emptyMsg.classList.remove('hidden');
        return;
      }
      emptyMsg.classList.add('hidden');

      joints.forEach((j, index) => {
        const card = document.createElement('div');
        card.className = 'bg-slate-900 border border-slate-700 p-2.5 rounded-xl space-y-1';
        card.innerHTML = `
          <div class="flex items-center justify-between text-xs font-semibold text-cyan-300">
            <span>Khớp #${index + 1}: ${j.partA.userData.name} ⮀ ${j.partB.userData.name}</span>
            <button onclick="removeJoint('${j.id}')" class="text-rose-400 hover:text-rose-300"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
          </div>
          <p class="text-[10px] text-slate-400 font-mono">Lỗ A (#${j.socketA.index}) ⮀ Lỗ B (#${j.socketB.index})</p>
        `;
        container.appendChild(card);
      });
      if (window.lucide) window.lucide.createIcons();
    }

    function removeJoint(jointId) {
      joints = joints.filter(j => j.id !== jointId);
      updateJointsUI();
      recordHistoryState();
      showToast("Đã tháo khớp ghép");
    }

    function openJoinWizardForSelected() {
      if (selectedPart) {
        pickedFirstPart = selectedPart;
        updateJoinWizardUI();
        setSidebarTab('joinwizard');
      }
    }

