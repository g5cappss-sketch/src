    function spawnTechnicBeam(holesCount = 7, colorHex = 0x94a3b8, namePrefix = 'Dầm Kỹ Thuật', options = {}) {
      const { skipHistory = false, skipSelect = false } = options;
      const group = new THREE.Group();
      const { geom, halfLen } = createRealisticBeamGeometry(holesCount, BEAM_HEIGHT);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.72,
        metalness: 0.0
      });

      const mainMesh = new THREE.Mesh(geom, mat);
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = true;
      group.add(mainMesh);

      const collarMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.65, metalness: 0.05 });
      const sockets = [];
      const badgeGroup = new THREE.Group();
      badgeGroup.name = "badges";

      for (let i = 1; i <= holesCount; i++) {
        const xPos = -halfLen + (i - 1) * DV;

        const collarGeom = new THREE.TorusGeometry(0.32, 0.022, 8, 24);
        collarGeom.rotateX(Math.PI / 2);
        const collarTop = new THREE.Mesh(collarGeom, collarMat);
        collarTop.position.set(xPos, BEAM_HEIGHT / 2 + 0.005, 0);
        group.add(collarTop);

        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${i}`;
        socketNode.position.set(xPos, BEAM_HEIGHT / 2, 0);
        socketNode.userData = { index: i, type: 'vertical', desc: `Lỗ đứng #${i}`, isSocketNode: true };
        group.add(socketNode);

        sockets.push({ index: i, x: xPos, y: BEAM_HEIGHT / 2, z: 0, dir: 'vertical', desc: `Lỗ #${i}` });

        const badge = createHoleBadgeSprite(i, false);
        badge.position.set(xPos, BEAM_HEIGHT / 2 + 0.22, 0);
        badgeGroup.add(badge);
      }
      group.add(badgeGroup);

      const partId = 'beam_' + Date.now() + '_' + Math.floor(Math.random() * 100);
      group.position.set((Math.random() - 0.5) * 3, BEAM_HEIGHT / 2, (Math.random() - 0.5) * 3);
      group.userData = {
        id: partId,
        name: `${namePrefix} (${holesCount} Lỗ)`,
        color: colorHex,
        holes: sockets,
        holesCount,
        kind: 'beam',
        minY: BEAM_HEIGHT / 2,
        isCustomPart: true
      };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast(`Đã thêm ${namePrefix} (${holesCount} Lỗ)`);
      }
      return group;
    }

    function spawnDVBar(holesCount = 5, options = {}) {
      const { skipHistory = false, skipSelect = false } = options;
      const group = new THREE.Group();
      const height = 1.0;
      const { geom, halfLen } = createRealisticBeamGeometry(holesCount, height);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd4d4d8,
        metalness: 0.65,
        roughness: 0.32
      });

      const mainMesh = new THREE.Mesh(geom, mat);
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = true;
      group.add(mainMesh);

      const sockets = [];
      const badgeGroup = new THREE.Group();
      badgeGroup.name = "badges";

      for (let i = 1; i <= holesCount; i++) {
        const xPos = -halfLen + (i - 1) * DV;
        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${i}`;
        socketNode.position.set(xPos, height / 2, 0);
        socketNode.userData = { isSocketNode: true, index: i };
        group.add(socketNode);

        sockets.push({ index: i, x: xPos, y: height / 2, z: 0, dir: 'vertical', desc: `Lỗ DV #${i}` });
        const badge = createHoleBadgeSprite(i, false);
        badge.position.set(xPos, height / 2 + 0.2, 0);
        badgeGroup.add(badge);
      }
      group.add(badgeGroup);

      const partId = 'dv_' + Date.now();
      group.position.set((Math.random() - 0.5) * 3, height / 2, (Math.random() - 0.5) * 3);
      group.userData = { id: partId, name: `Thanh DV (${holesCount} Lỗ)`, color: 0xd4d4d8, holes: sockets, holesCount, kind: 'dv-bar', minY: height / 2, isCustomPart: true };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast(`Đã thêm Thanh DV Thép CNC (${holesCount} Lỗ)`);
      }
      return group;
    }

    function spawnYellowBracket(options = {}) {
      const { skipHistory = false, skipSelect = false } = options;
      const group = new THREE.Group();
      const height = 1.0;
      const { geom, halfLen } = createRealisticBeamGeometry(3, height);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        roughness: 0.55,
        metalness: 0.12
      });

      const mainMesh = new THREE.Mesh(geom, mat);
      mainMesh.castShadow = true;
      group.add(mainMesh);

      const sockets = [];
      const badgeGroup = new THREE.Group();
      badgeGroup.name = "badges";

      for (let i = 1; i <= 3; i++) {
        const xPos = -halfLen + (i - 1) * DV;
        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${i}`;
        socketNode.position.set(xPos, height / 2, 0);
        socketNode.userData = { isSocketNode: true, index: i };
        group.add(socketNode);

        sockets.push({ index: i, x: xPos, y: height / 2, z: 0, dir: 'vertical', desc: `Lỗ Nẹp #${i}` });
        const badge = createHoleBadgeSprite(i, false);
        badge.position.set(xPos, height / 2 + 0.2, 0);
        badgeGroup.add(badge);
      }
      group.add(badgeGroup);

      const partId = 'bracket_' + Date.now();
      group.position.set((Math.random() - 0.5) * 3, height / 2, (Math.random() - 0.5) * 3);
      group.userData = { id: partId, name: 'Nẹp Dập Sơn Vàng (3 Lỗ)', color: 0xeab308, holes: sockets, holesCount: 3, kind: 'yellow-bracket', minY: height / 2, isCustomPart: true };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast('Đã thêm Nẹp Dập Sơn Vàng (3 Lỗ)');
      }
      return group;
    }

    function spawnStandalonePin(colorHex = 0x0284c7, options = {}) {
      const { skipHistory = false, skipSelect = false } = options;
      const group = new THREE.Group();
      const pinMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.68, metalness: 0.0 });

      const shaftGeom = new THREE.CylinderGeometry(0.24, 0.24, 2.0, 24);
      const shaftMesh = new THREE.Mesh(shaftGeom, pinMat);
      shaftMesh.castShadow = true;
      group.add(shaftMesh);

      const collarGeom = new THREE.CylinderGeometry(0.33, 0.33, 0.12, 24);
      const collarMesh = new THREE.Mesh(collarGeom, pinMat);
      collarMesh.castShadow = true;
      group.add(collarMesh);

      [-0.9, 0.9].forEach(y => {
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.02, 8, 20), pinMat);
        lip.rotation.x = Math.PI / 2;
        lip.position.y = y;
        group.add(lip);
      });

      const sockets = [
        { index: 1, x: 0, y: 1.0, z: 0, dir: 'vertical', desc: 'Đầu chốt A' },
        { index: 2, x: 0, y: -1.0, z: 0, dir: 'vertical', desc: 'Đầu chốt B' }
      ];

      sockets.forEach(s => {
        const socketNode = new THREE.Object3D();
        socketNode.name = `SOCKET_HOLE_V_${s.index}`;
        socketNode.position.set(s.x, s.y, s.z);
        socketNode.userData = { isSocketNode: true, index: s.index };
        group.add(socketNode);
      });

      const badgeGroup = new THREE.Group();
      badgeGroup.name = "badges";
      sockets.forEach(s => {
        const badge = createHoleBadgeSprite(s.index, false);
        badge.position.set(s.x, s.y + (s.y > 0 ? 0.22 : -0.22), s.z);
        badgeGroup.add(badge);
      });
      group.add(badgeGroup);

      const partId = 'pin_' + Date.now();
      group.position.set((Math.random() - 0.5) * 3, 1.0, (Math.random() - 0.5) * 3);
      group.userData = { id: partId, name: 'Chốt Trục Đàn Hồi', color: colorHex, holes: sockets, holesCount: 2, kind: 'pin', minY: 1.0, isPin: true, isCustomPart: true };

      scene.add(group);
      parts.push(group);
      placeNewPartInEmptySpace(group);
      if (!skipSelect) selectPart(group);
      updatePartsCount();
      if (!skipHistory) {
        recordHistoryState();
        showToast('Đã thêm Chốt Trục Đàn Hồi');
      }
      return group;
    }

    function spawnAssemblyCombo(type) {
      try {
        let createdParts = [];
        if (type === 'parallel') {
          const b1 = spawnTechnicBeam(7, 0x94a3b8, 'Dầm Xám (7 Lỗ)', { skipHistory: true, skipSelect: true });
          b1.position.set(0, BEAM_HEIGHT / 2, -0.6);
          const b2 = spawnTechnicBeam(7, 0x0284c7, 'Dầm Xanh (7 Lỗ)', { skipHistory: true, skipSelect: true });
          b2.position.set(0, BEAM_HEIGHT * 1.5, -0.6);
          const pin = spawnStandalonePin(0x38bdf8, { skipHistory: true, skipSelect: true });
          pin.position.set(0, BEAM_HEIGHT, -0.6);
          joints.push({
            id: 'joint_combo_' + Date.now(),
            partA: b1,
            partB: pin,
            socketA: b1.userData.holes[3],
            socketB: pin.userData.holes[0]
          });
          createdParts = [b1, b2, pin];
          selectPart(b2);
        } else if (type === 'l-shape') {
          const b1 = spawnTechnicBeam(7, 0x94a3b8, 'Dầm Thân (7 Lỗ)', { skipHistory: true, skipSelect: true });
          b1.position.set(0, BEAM_HEIGHT / 2, 0);
          const b2 = spawnTechnicBeam(5, 0xeab308, 'Dầm Vuông (5 Lỗ)', { skipHistory: true, skipSelect: true });
          b2.rotation.y = Math.PI / 2;
          b2.position.set(-3.0, BEAM_HEIGHT * 1.5, 2.0);
          joints.push({
            id: 'joint_combo_' + Date.now(),
            partA: b1,
            partB: b2,
            socketA: b1.userData.holes[3],
            socketB: b2.userData.holes[0]
          });
          createdParts = [b1, b2];
          selectPart(b2);
        } else if (type === 'scissor') {
          const b1 = spawnTechnicBeam(7, 0x94a3b8, 'Thanh 1 (7 Lỗ)', { skipHistory: true, skipSelect: true });
          b1.rotation.y = Math.PI / 6;
          b1.position.set(0, BEAM_HEIGHT / 2, 0);
          const b2 = spawnTechnicBeam(7, 0xa855f7, 'Thanh 2 (7 Lỗ)', { skipHistory: true, skipSelect: true });
          b2.rotation.y = -Math.PI / 6;
          b2.position.set(0, BEAM_HEIGHT * 1.5, 0);
          joints.push({
            id: 'joint_combo_' + Date.now(),
            partA: b1,
            partB: b2,
            socketA: b1.userData.holes[3],
            socketB: b2.userData.holes[0]
          });
          createdParts = [b1, b2];
          selectPart(b2);
        }

        fitCameraToParts(createdParts);
        updateJointsUI();
        recordHistoryState();

        const names = {
          'parallel': '2 Thanh Song Song',
          'l-shape': 'Khớp Chữ L (90°)',
          'scissor': 'Khớp Kéo Cắt'
        };
        showToast(`Đã nạp cụm: ${names[type] || type}`);
      } catch (err) {
        console.error("Lỗi khi nạp cụm combo:", err);
        showToast("Không thể nạp cụm lắp ghép!", "error");
      }
    }

