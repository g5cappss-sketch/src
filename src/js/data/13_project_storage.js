    function saveProjectFile() {
      const projectData = {
        version: "1.0",
        date: new Date().toISOString(),
        parts: parts.map(p => ({
          id: p.userData.id,
          name: p.userData.name,
          kind: p.userData.kind || 'beam',
          color: p.userData.color,
          holesCount: (p.userData.holes || []).length,
          holes: p.userData.holes,
          pos: [p.position.x, p.position.y, p.position.z],
          rot: [p.rotation.x, p.rotation.y, p.rotation.z]
        }))
      };

      const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `du_an_co_khi_${Date.now()}.craft3d.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast('Đã lưu file dự án');
    }

    function loadProjectFile(file) {
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          const savedParts = Array.isArray(data.parts) ? data.parts : [];

          if (savedParts.length === 0) {
            showToast('File dự án rỗng hoặc không hợp lệ!', 'error');
            return;
          }

          clearAllParts({ skipHistory: true });

          savedParts.forEach((entry) => {
            const restored = rebuildProjectPartFromSnapshot(entry);
            if (!restored) {
              const estimatedCount = entry.holesCount || entry.holes?.length || 7;
              const fallback = spawnTechnicBeam(estimatedCount, entry.color || 0x94a3b8, entry.name || 'Dầm Kỹ Thuật', { skipHistory: true, skipSelect: true });
              if (fallback) {
                fallback.position.set(entry.pos?.[0] ?? 0, entry.pos?.[1] ?? 0, entry.pos?.[2] ?? 0);
                fallback.rotation.set(entry.rot?.[0] ?? 0, entry.rot?.[1] ?? 0, entry.rot?.[2] ?? 0);
              }
            }
          });

          updatePartsCount();
          updateJoinWizardUI();
          updateJointsUI();
          recordHistoryState();
          showToast('Đã tải dự án thành công');
        } catch (error) {
          console.error(error);
          showToast('File dự án không hợp lệ!', 'error');
        }
      };

      reader.readAsText(file);
    }

