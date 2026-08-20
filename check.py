import sys; sys.path.insert(0, r'd:\Project\VibeETL - Copy\backend'); from app.tools import NODE_CLASSES;
for k, v in NODE_CLASSES.items():
    if hasattr(v, 'MANIFEST'):
        inputs = v.MANIFEST.get('inputs')
        outputs = v.MANIFEST.get('outputs')
        print(k, inputs, outputs)

