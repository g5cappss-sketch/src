    function getWorldSocketPosition(part, socket) {
      part.updateMatrixWorld(true);
      return new THREE.Vector3(socket.x, socket.y, socket.z).applyMatrix4(part.matrixWorld);
    }

    function getLocalHoleCenter(socket) {
      const center = new THREE.Vector3(socket.x, socket.y, socket.z);
      if (socket.dir === 'vertical') center.y -= socket.y * 2;
      return center;
    }

    function getWorldHoleCenter(part, socket) {
      const surfacePosition = getWorldSocketPosition(part, socket);
      if (socket.dir !== 'vertical' || Math.abs(socket.y) < 0.001) return surfacePosition;

      const inwardOffset = new THREE.Vector3(0, socket.y * 2, 0)
        .applyQuaternion(part.quaternion);
      return surfacePosition.sub(inwardOffset);
    }

    function getComponentSnapPosition(part, componentSocket, pinSocket) {
      return pinSocket.y < 0
        ? getWorldHoleCenter(part, componentSocket)
        : getWorldSocketPosition(part, componentSocket);
    }

    function getLocalComponentSnapPosition(componentSocket, pinSocket) {
      return pinSocket.y < 0
        ? getLocalHoleCenter(componentSocket)
        : new THREE.Vector3(componentSocket.x, componentSocket.y, componentSocket.z);
    }

    function getMagneticPartners(part) {
      const partners = [];
      joints.forEach(j => {
        if (!j.id.startsWith('magnetic_joint_')) return;
        if (j.partA === part && j.partB && !partners.includes(j.partB)) partners.push(j.partB);
        if (j.partB === part && j.partA && !partners.includes(j.partA)) partners.push(j.partA);
      });
      return partners;
    }

    function canMagneticallyReattach(part, targetPart) {
      const releaseParts = part.userData.magneticReleaseParts || [];
      if (!releaseParts.includes(targetPart)) return true;

      const origin = part.userData.magneticReleaseOrigin;
      const current = part.getWorldPosition(new THREE.Vector3());
      if (!origin || current.distanceTo(origin) > 0.65) {
        part.userData.magneticReleaseParts = [];
        part.userData.magneticReleaseOrigin = null;
        return true;
      }
      return false;
    }

    function findNearestPinSnap(pin, maxDistance = 1.0) {
      const pinSockets = pin.userData.holes || [];
      let nearest = null;
      pin.updateMatrixWorld(true);

      const pinWorldPosition = pin.getWorldPosition(new THREE.Vector3());
      const pinBounds = new THREE.Box3();
      pin.traverse(child => {
        if (child.isMesh && !child.userData.isBadge && child.parent?.name !== 'badges') {
          pinBounds.expandByObject(child);
        }
      });
      const pinBottomOffset = pinBounds.min.y - pinWorldPosition.y;

      for (const pinSocket of pinSockets) {
        for (const targetPart of parts) {
          if (targetPart === pin || targetPart.userData?.isPin) continue;
          if (!canMagneticallyReattach(pin, targetPart)) continue;
          if (isMagneticSocketOccupied(pin, pinSocket, targetPart)) continue;

          for (const targetSocket of targetPart.userData?.holes || []) {
            if (isMagneticSocketOccupied(targetPart, targetSocket, pin)) continue;
            const targetPosition = getComponentSnapPosition(targetPart, targetSocket, pinSocket);
            const alignedQuaternion = targetPart.getWorldQuaternion(new THREE.Quaternion());
            const rotatedSocket = new THREE.Vector3(pinSocket.x, pinSocket.y, pinSocket.z)
              .applyQuaternion(alignedQuaternion);
            const desiredWorldPosition = targetPosition.clone().sub(rotatedSocket);
            const distance = pinWorldPosition.distanceTo(desiredWorldPosition);
            const snapDistance = Math.max(maxDistance, targetPart.userData?.holesCount >= 11 ? 1.5 : 0);
            if (distance > snapDistance) continue;

            const wouldPenetrateGround = desiredWorldPosition.y + pinBottomOffset < -0.01;
            if (wouldPenetrateGround) continue;

            if (!nearest || distance < nearest.distance) {
              nearest = { pinSocket, targetPart, targetSocket, targetPosition, distance };
            }
          }
        }
      }

      return nearest;
    }

    function findNearestComponentSnap(part, maxDistance = 1.0) {
      const componentSockets = part.userData.holes || [];
      let nearest = null;

      for (const componentSocket of componentSockets) {
        const holePosition = getWorldSocketPosition(part, componentSocket);
        for (const pin of parts) {
          if (!pin.userData?.isPin || pin === part) continue;
          if (!canMagneticallyReattach(part, pin)) continue;

          for (const pinSocket of pin.userData.holes || []) {
            if (isMagneticSocketOccupied(pin, pinSocket, part)) continue;
            if (isMagneticSocketOccupied(part, componentSocket, pin)) continue;
            const holePosition = getComponentSnapPosition(part, componentSocket, pinSocket);
            const pinPosition = getWorldSocketPosition(pin, pinSocket);
            const distance = holePosition.distanceTo(pinPosition);
            const snapDistance = Math.max(maxDistance, part.userData?.holesCount >= 11 ? 1.5 : 0);
            if (distance <= snapDistance && (!nearest || distance < nearest.distance)) {
              nearest = { componentSocket, pin, pinSocket, pinPosition, distance };
            }
          }
        }
      }

      return nearest;
    }

    function isMagneticSocketOccupied(part, socket, exceptPart = null) {
      return joints.some(j => {
        if (!j.id.startsWith('magnetic_joint_')) return false;
        if (j.partA === exceptPart || j.partB === exceptPart) return false;
        return (j.partA === part && socketsMatch(j.socketA, socket)) ||
          (j.partB === part && socketsMatch(j.socketB, socket));
      });
    }

    function socketsMatch(firstSocket, secondSocket) {
      if (firstSocket === secondSocket) return true;
      return Boolean(firstSocket && secondSocket &&
        firstSocket.index === secondSocket.index &&
        firstSocket.dir === secondSocket.dir);
    }

    function detachMagneticJoints(part) {
      const detached = joints.some(j => j.id.startsWith('magnetic_joint_') &&
        (j.partA === part || j.partB === part || j.pin === part));
      if (!detached) return;

      joints = joints.filter(j => !(j.id.startsWith('magnetic_joint_') &&
        (j.partA === part || j.partB === part || j.pin === part)));
      part.userData.magneticJointId = null;
      part.userData.magneticSnapped = false;
      updateJointsUI();
    }

    function detachMagneticSocket(part, socket) {
      const previousLength = joints.length;
      joints = joints.filter(j => {
        if (!j.id.startsWith('magnetic_joint_')) return true;
        const usesSocket = (j.partA === part && socketsMatch(j.socketA, socket)) ||
          (j.partB === part && socketsMatch(j.socketB, socket));
        return !usesSocket;
      });

      if (joints.length !== previousLength) updateJointsUI();
    }

    function detachPinJoints(pin) {
      detachMagneticJoints(pin);
    }

    // ==========================================
    // HỆ THỐNG QUẢN LÝ CỤM LẮP RÁP (ASSEMBLY)
    // ==========================================

    // Gộp các linh kiện đã nối vào cùng một cụm, giữ nguyên tọa độ thế giới.
    function lockIntoAssembly(partA, partB) {
      const groupA = partA.parent?.userData.isAssemblyGroup ? partA.parent : null;
      const groupB = partB.parent?.userData.isAssemblyGroup ? partB.parent : null;
      let assemblyGroup = groupA || groupB;

      if (!assemblyGroup) {
        assemblyGroup = new THREE.Group();
        assemblyGroup.userData.isAssemblyGroup = true;
        scene.add(assemblyGroup);
      }

      // Nếu 2 linh kiện thuộc 2 cụm khác nhau, gộp chung lại thành 1 cụm lớn
      [groupA, groupB].forEach(group => {
        if (!group || group === assemblyGroup) return;
        [...group.children].forEach(child => assemblyGroup.attach(child));
        group.parent?.remove(group);
      });

      if (partA.parent !== assemblyGroup) assemblyGroup.attach(partA);
      if (partB.parent !== assemblyGroup) assemblyGroup.attach(partB);
    }

    // Tách 1 linh kiện ra khỏi cụm
    function separatePartFromAssembly(part) {
      const oldGroup = part.parent?.userData.isAssemblyGroup ? part.parent : null;
      if (!oldGroup) return false;

      detachMagneticJoints(part); // Cắt đứt liên kết nam châm
      scene.attach(part); // Đưa vật thể rơi ra ngoài scene gốc

      // Cấu trúc lại các linh kiện còn sót lại trong cụm cũ
      rebuildAssemblyGroups(oldGroup.children.slice());
      oldGroup.parent?.remove(oldGroup); // Xóa cụm cũ
      return true;
    }

    // Đảm bảo khi rút 1 chốt ở giữa, nếu cụm bị gãy làm đôi thì sẽ tự tách thành 2 cụm độc lập
    function rebuildAssemblyGroups(groupParts) {
      const remainingParts = new Set(groupParts);
      const connections = new Map(groupParts.map(part => [part, new Set()]));

      joints.forEach(joint => {
        if (!joint.id.startsWith('magnetic_joint_') ||
          !remainingParts.has(joint.partA) || !remainingParts.has(joint.partB)) return;
        connections.get(joint.partA).add(joint.partB);
        connections.get(joint.partB).add(joint.partA);
      });

      while (remainingParts.size > 0) {
        const component = [];
        const pending = [remainingParts.values().next().value];
        while (pending.length > 0) {
          const current = pending.pop();
          if (!remainingParts.delete(current)) continue;
          component.push(current);
          connections.get(current).forEach(neighbor => pending.push(neighbor));
        }

        if (component.length > 1) {
          const assemblyGroup = new THREE.Group();
          assemblyGroup.userData.isAssemblyGroup = true;
          scene.add(assemblyGroup);
          component.forEach(member => assemblyGroup.attach(member));
        } else if (component.length === 1) {
          scene.attach(component[0]); // Nếu chỉ còn 1 mảnh, cho rơi ra ngoài luôn
        }
      }
    }

    // HÀM HỖ TRỢ ĐỈNH CAO: Tự động tính toán để di chuyển cả Cụm hoặc Linh kiện đơn lẻ cực kỳ chuẩn xác
    function movePartToDesiredWorld(part, desiredWorldPos, desiredWorldQuat) {
      const isGrouped = part.parent && part.parent.userData.isAssemblyGroup;
      const targetNode = isGrouped ? part.parent : part;

      if (isGrouped) {
        const partLocalQuat = part.quaternion.clone();
        targetNode.quaternion.copy(desiredWorldQuat.clone().multiply(partLocalQuat.invert()));
        targetNode.updateMatrixWorld(true);

        const currentPartWorldPos = part.getWorldPosition(new THREE.Vector3());
        const offset = desiredWorldPos.clone().sub(currentPartWorldPos);
        targetNode.position.add(offset);
        targetNode.updateMatrixWorld(true);
      } else {
        targetNode.quaternion.copy(desiredWorldQuat);
        targetNode.position.copy(desiredWorldPos);
        targetNode.updateMatrixWorld(true);
      }
    }

   function snapPinToHole(pin, snap) {
      const desiredWorldQuaternion = snap.targetPart.getWorldQuaternion(new THREE.Quaternion());
      const isHorizontal = snap.targetSocket && (snap.targetSocket.dir === 'horizontal' || snap.targetSocket.type === 'horizontal');
      if (isHorizontal) {
        desiredWorldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      }
      
      const rotatedSocket = new THREE.Vector3(snap.pinSocket.x, snap.pinSocket.y, snap.pinSocket.z)
        .applyQuaternion(desiredWorldQuaternion);
      const desiredWorldPosition = snap.targetPosition.clone().sub(rotatedSocket);

      // Gọi hàm hỗ trợ di chuyển
      movePartToDesiredWorld(pin, desiredWorldPosition, desiredWorldQuaternion);

      const currentJoint = joints.find(j => j.id.startsWith('magnetic_joint_') &&
        j.partA === pin && j.socketA === snap.pinSocket &&
        j.partB === snap.targetPart && j.socketB === snap.targetSocket);
        
      if (!currentJoint || currentJoint.partB !== snap.targetPart || currentJoint.socketB !== snap.targetSocket) {
        detachMagneticSocket(pin, snap.pinSocket);
        detachMagneticSocket(snap.targetPart, snap.targetSocket);
        const jointId = 'magnetic_joint_' + Date.now();
        joints.push({ id: jointId, partA: pin, partB: snap.targetPart, socketA: snap.pinSocket, socketB: snap.targetSocket, pin });
        
        // ĐÃ XÓA LỆNH KHÓA CỤM Ở ĐÂY ĐỂ TRÁNH GIẬT CHUỘT
        pin.userData.magneticJointId = jointId;
        pin.userData.magneticSnapped = true;
        if (typeof updateJointsUI === 'function') updateJointsUI();
      }
    }

    function snapComponentToPin(part, snap) {
      const desiredWorldQuaternion = snap.pin.getWorldQuaternion(new THREE.Quaternion());
      const isHorizontal = snap.componentSocket && (snap.componentSocket.dir === 'horizontal' || snap.componentSocket.type === 'horizontal');
      if (isHorizontal) {
        desiredWorldQuaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      }

      const rotatedHole = getLocalComponentSnapPosition(snap.componentSocket, snap.pinSocket)
        .applyQuaternion(desiredWorldQuaternion);
      const desiredWorldPosition = snap.pinPosition.clone().sub(rotatedHole);

      // Gọi hàm hỗ trợ di chuyển
      movePartToDesiredWorld(part, desiredWorldPosition, desiredWorldQuaternion);

      const currentJoint = joints.find(j => j.id.startsWith('magnetic_joint_') &&
        j.partA === snap.pin && j.socketA === snap.pinSocket &&
        j.partB === part && j.socketB === snap.componentSocket);
        
      if (!currentJoint || currentJoint.partA !== snap.pin || currentJoint.socketA !== snap.pinSocket) {
        detachMagneticSocket(part, snap.componentSocket);
        detachMagneticSocket(snap.pin, snap.pinSocket);
        const jointId = 'magnetic_joint_' + Date.now();
        joints.push({ id: jointId, partA: snap.pin, partB: part, socketA: snap.pinSocket, socketB: snap.componentSocket, pin: snap.pin });
        
        // ĐÃ XÓA LỆNH KHÓA CỤM Ở ĐÂY ĐỂ TRÁNH GIẬT CHUỘT
        part.userData.magneticJointId = jointId;
        part.userData.magneticSnapped = true;
        if (typeof updateJointsUI === 'function') updateJointsUI();
      }
    }