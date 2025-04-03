"""
This module patches typing issues with fsspec in Python 3.9
"""
import sys
import importlib
import types

def apply_patch():
    """Apply the patch to fix fsspec typing issue with Python 3.9"""
    from typing import Callable, _GenericAlias
    
    # Save the original __getitem__
    original_getitem = Callable.__getitem__
    
    # Create a patched __getitem__ function
    def patched_getitem(self, params):
        if isinstance(params, list) and len(params) > 0 and isinstance(params[0], list):
            # Convert nested list to a single list for fsspec's MultiFetcher case
            return _GenericAlias(self, tuple(params))
        return original_getitem(self, params)
    
    # Apply the patch
    Callable.__getitem__ = patched_getitem
    
    # Return success message
    return "Patch applied successfully"

if sys.version_info[:2] == (3, 9):
    print("Python 3.9 detected, applying fsspec typing patch...")
    apply_patch()