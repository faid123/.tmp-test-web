using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using CommandUndoRedo;

[CreateAssetMenu(fileName = "RPD Assembly", menuName = "Component/New RPD Assembly")]
public class RPDAssembly : RPDPlaceable
{
	public RPDComponent[] rpdComponents;

	/// <summary>
	/// Places this assembly
	/// </summary>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="componentsPlacedCount">Out number of components placed</param>
	/// <returns></returns>
	public virtual bool Place(int toothFDIID, out CriteriaFailureData failureData, out int componentsPlacedCount)
	{
		return PerformPlacing(toothFDIID, rpdComponents, out failureData, out componentsPlacedCount);
	}

	/// <summary>
	/// Handles sequence that places the assembly
	/// </summary>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="rpdComponents">Components to place</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="componentsPlacedCount">Out number of components placed</param>
	/// <returns></returns>
	protected virtual bool PerformPlacing(int toothFDIID, RPDComponent[] rpdComponents, out CriteriaFailureData failureData, out int componentsPlacedCount)
	{
		bool success = PlaceComponents(toothFDIID, rpdComponents, out componentsPlacedCount, out failureData);

		if (!success)
		{
			UndoPlacedComponents(componentsPlacedCount);
			componentsPlacedCount = 0;
		}

		return success;
	}

	/// <summary>
	/// Places components required for the assembly
	/// </summary>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="rpdComponents">Components to place</param>
	/// <param name="componentsPlacedCount">Out number of components placed</param>
	/// <param name="failureData">Out failure data</param>
	/// <returns></returns>
	protected virtual bool PlaceComponents(int toothFDIID, RPDComponent[] rpdComponents, out int componentsPlacedCount, out CriteriaFailureData failureData)
	{
		componentsPlacedCount = 0;
		failureData = null;

		foreach (RPDComponent component in rpdComponents)
		{
			if (component == null)
				continue;

			bool success = RPDManager.instance.PlaceComponent(component, toothFDIID, out failureData, structureBeingPlaced:this);

			if (!success)
				return false;

			componentsPlacedCount++;
		}

		return true;
	}

	/// <summary>
	/// Undoes components that were placed while attempting to place this assembly
	/// </summary>
	/// <param name="componentsPlacedCount">Number of components to undo</param>
	protected virtual void UndoPlacedComponents(int componentsPlacedCount)
	{
		//undo all placed components

		for (int i = 0; i < componentsPlacedCount; i++)
		{
			UndoRedoManager.Undo();
		}

		UndoRedoManager.ClearRedos();
	}
}
