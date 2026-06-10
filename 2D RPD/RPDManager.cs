using CommandUndoRedo;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class RPDManager : MonoBehaviour
{
	public enum PlacementMode
	{
		None,
		ToothRaycast,
		Button
	}

	public static RPDManager instance;

	public bool useNew2DSystem = true;

	PlacementMode _placementMode = PlacementMode.None;
	public PlacementMode placementMode
	{
		get
		{
			return _placementMode;
		}
		set
		{
			if (verboseDebugMode)
				Logger.Log(TypeLog.RPD2D, $"Placement mode set to {value}.");

			_placementMode = value;
		}
	}

	public bool AllowTeethRaycast
	{
		get
		{
			if (!useNew2DSystem)
				return true;

			if (placementMode == PlacementMode.ToothRaycast)
				return true;

			return false;
		}
	}

	[Header("Remove/Auto Placement Priority")]
	[Tooltip("Used when clearing all components and loading proposed design and their undo/redos. " +
		"Components closer to the top of the list will be placed first, removed last. " +
		"Best to be used for 'foundational' components, like Meshes.")]
	List<RPDComponent> priorityList = new List<RPDComponent>();

	[Header("Not fully implemented yet")]
	[Tooltip("Currently not fully implemented")]
	//prints debug log whenever doing criteria checks, etc
	public bool verboseDebugMode = false;

	//number of undos that need to be performed to properly return to the restore point
	int cancelRestorePointUndoCount = 0;
	bool restorePointCreated = false;

	public event System.Action<Jaw_Type> OnComponentPlaced; //includes placed special, undifferentiated
	public event System.Action<Jaw_Type> OnComponentRemoved; //includes removed special, undifferentiated

	void Awake()
	{
		instance = this;

		DemoManager.OnDemoModeToggled += OnDemoModeToggled;
	}

	private void OnDemoModeToggled(bool demoModeActive)
	{
		if (demoModeActive)
			useNew2DSystem = false;
	}

	private void OnDestroy()
	{
		UnregisterUndoRedoEvent();
	}

	/// <summary>
	/// Set none placement mode
	/// </summary>
	public void SetNonePlacementMode()
	{
		placementMode = PlacementMode.None;
	}

	/// <summary>
	/// Set Tooth Raycast placement mode
	/// </summary>
	public void SetToothRaycastPlacementMode()
	{
		placementMode = PlacementMode.ToothRaycast;
	}

	/// <summary>
	/// Set Button placement mode
	/// </summary>
	public void SetButtonPlacementMode()
	{
		placementMode = PlacementMode.Button;
	}

	/// <summary>
	/// Places an assembly
	/// </summary>
	/// <param name="assembly">The assembly</param>
	/// <param name="toothFDIID">The tooth FDI ID</param>
	/// <returns>True if sucessful, false otherwise</returns>
	public bool PlaceAssembly(RPDAssembly assembly, int toothFDIID)
	{
		//place each component in sequence, until a failure is met
		//if no failure -> continue
		//if failure, stop placing, undo all placed components, return an failure data

		bool success = assembly.Place(toothFDIID, out CriteriaFailureData failureData, out int numberOfUndosToCombine);

		if (!success)
		{
			Logger.LogError(TypeLogError.RPD2D, failureData.failureReason);
			return false;
		}

		CombineUndos(numberOfUndosToCombine);

		return true;
	}

	/// <summary>
	/// Internal function to place components
	/// </summary>
	/// <param name="rpdComponent">Component to be placed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="placedComponentOverride">Out override List containing placed components</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <param name="placeAndRemoveSpecial">Use Place Special and Remove Special instead?</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise. Refer to failure data for more info if false.</returns>
	bool _PlaceComponent(RPDComponent rpdComponent, int toothFDIID, out CriteriaFailureData failureData, bool createUndoRedoCommand, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride, bool placeAndRemoveSpecial, RPDPlaceable structureBeingPlaced)
	{
		RPDCommand undoRedoCommand = null;
		List<RPDCommand.Data> placedComponents = new List<RPDCommand.Data>();
		List<RPDCommand.Data> removedComponents = new List<RPDCommand.Data>();

		if (createUndoRedoCommand)
		{
			placedComponents = new List<RPDCommand.Data>();
			removedComponents = new List<RPDCommand.Data>();
		}

		PlacementData placementData = new PlacementData(rpdComponent, toothFDIID, structureBeingPlaced);

		if (verboseDebugMode)
			Logger.Log(TypeLog.RPD2D, $"Trying to place {rpdComponent.displayName} on tooth FDI ID {toothFDIID}.");

		bool successfullyPlaced = false;
		if (placeAndRemoveSpecial)
			successfullyPlaced = rpdComponent.PlaceSpecial(placementData, out failureData, out placedComponentOverride, out removedComponentOverride);
		else
			successfullyPlaced = rpdComponent.Place(placementData, out failureData, out placedComponentOverride, out removedComponentOverride);

		if (verboseDebugMode)
		{
			string success = successfullyPlaced ? "Managed" : "Failed";
			string placeAction = placeAndRemoveSpecial ? "place special" : "place";
			Logger.Log(TypeLog.RPD2D, $"{success} to {placeAction} {rpdComponent.displayName} on tooth FDI ID {toothFDIID}.");
		}

		if (successfullyPlaced)
		{
			//ConnectorsLogic.instance.ReSetMajorConnectors(toothFDIID,false);

			if (createUndoRedoCommand)
			{
				placedComponents.Add(new RPDCommand.Data(toothFDIID, rpdComponent));

				//undoRedoCommand = new RPDCommand(placedComponents, removedComponents);
				//UndoRedoManager.Insert(undoRedoCommand);
				HandleUndoRedo(rpdComponent, placedComponentOverride == null ? placedComponents : placedComponentOverride, removedComponentOverride == null ? removedComponents : removedComponentOverride);

				ActionPerformed();
			}

			OnComponentPlaced?.Invoke(Utils.FDINumberingToJawType(toothFDIID));
			return true;
		}

		//placement unsuccessful, handle it here
		switch (failureData.actionUponFailure)
		{
			default:
				return false;
			case ActionUponFailure.PreventPlacement:
				//TODO create popup to show error message
				Logger.LogError(TypeLogError.RPD2D, failureData.failureReason);
				return false;
			case ActionUponFailure.RemoveThenPlace:
			case ActionUponFailure.RemoveThenPlaceSpecial:
				if (verboseDebugMode)
					Logger.Log(TypeLog.RPD2D, "Performing remove then place.");

				//possible problems with current design:
				// - multiple conflicting components could -possibly- be resolved by removing just one, but this is not done in current code
				// - placing component after removing might result in a different error (maybe?), which could result in an outright failure to place
				//   causing the removed components to be lost while the component that wants to be placed still not being placed
				//
				//possible TODO
				// - after PlaceComponent, check if it fails, if fails, place the previously removed components

				//go through each conflicting component, remove them
				foreach (KeyValuePair<RPDComponent, List<int>> conflictingComponentEntry in failureData.conflictingComponents)
				{
					foreach (int conflictingToothFDIID in conflictingComponentEntry.Value)
					{
						if (verboseDebugMode)
							Logger.Log(TypeLog.RPD2D, $"Removing {conflictingComponentEntry.Key.displayName} on tooth FDI ID {conflictingToothFDIID}.");

						bool removedSuccessfully = false;
						List<RPDCommand.Data> removedComponentOverrideDuringRemove;

						if (placeAndRemoveSpecial)
							removedSuccessfully = RemoveComponentSpecial(conflictingComponentEntry.Key, conflictingToothFDIID, false, out removedComponentOverrideDuringRemove);
						else
							removedSuccessfully = RemoveComponent(conflictingComponentEntry.Key, conflictingToothFDIID, false, out removedComponentOverrideDuringRemove);

						if (removedSuccessfully && createUndoRedoCommand)
						{
							if (removedComponentOverride != null)
								removedComponentOverride.AddRange(removedComponentOverrideDuringRemove);
							else
								removedComponentOverride = removedComponentOverrideDuringRemove;

							removedComponents.Add(new RPDCommand.Data(conflictingToothFDIID, conflictingComponentEntry.Key));
						}
					}
				}

				if (verboseDebugMode)
				{
					string placeAction = placeAndRemoveSpecial ? "place special" : "place";
					Logger.Log(TypeLog.RPD2D, $"Trying to {placeAction} {rpdComponent.displayName} on tooth FDI ID {toothFDIID} after removing conflicting components.");
				}

				//try placing again
				List<RPDCommand.Data> placedSpecialComponents = new List<RPDCommand.Data>();
				bool removeThenPlaceSucceeded = false;
				List<RPDCommand.Data> removedComponentOverrideDuringPlace = null;
				if (failureData.actionUponFailure == ActionUponFailure.RemoveThenPlace)
				{
					if (placeAndRemoveSpecial)
						removeThenPlaceSucceeded = PlaceComponentSpecial(rpdComponent, toothFDIID, out failureData, false, out placedComponentOverride, out removedComponentOverrideDuringPlace);
					else
						removeThenPlaceSucceeded = PlaceComponent(rpdComponent, toothFDIID, out failureData, false, out placedComponentOverride, out removedComponentOverrideDuringPlace);
				}
				else if (failureData.actionUponFailure == ActionUponFailure.RemoveThenPlaceSpecial)
				{
					List<RPDCommand.Data> removedComps = removedComponentOverride == null ? removedComponents : removedComponentOverride;

					foreach (RPDCommand.Data removedComp in removedComps)
					{
						removeThenPlaceSucceeded = PlaceComponentSpecial(rpdComponent, removedComp.toothFDIID, out failureData, false, out placedComponentOverride, out removedComponentOverrideDuringPlace);

						if (removeThenPlaceSucceeded)
							placedSpecialComponents.Add(new RPDCommand.Data(removedComp.toothFDIID, rpdComponent));
						else
							break;
					}
				}
				else
				{
					Logger.LogError(TypeLogError.RPD2D, $"Unable to Remove Then Place, unhandled Action Upon Failure of {failureData.actionUponFailure}");
					return false;
				}

				if (removeThenPlaceSucceeded && createUndoRedoCommand)
				{
					if (removedComponentOverride != null)
					{
						if (removedComponentOverrideDuringPlace != null)
							removedComponentOverride.AddRange(removedComponentOverrideDuringPlace);
					}
					else
						removedComponentOverride = removedComponentOverrideDuringPlace;

					placedComponents.Add(new RPDCommand.Data(toothFDIID, rpdComponent));

					//undoRedoCommand = new RPDCommand(placedComponents, removedComponents);
					//UndoRedoManager.Insert(undoRedoCommand);
					HandleUndoRedo(rpdComponent, placedComponentOverride == null ? placedComponents : placedComponentOverride, removedComponentOverride == null ? removedComponents : removedComponentOverride, placedSpecialComponents);

					ActionPerformed();
				}

				return removeThenPlaceSucceeded;
		}

		//void HandleUndoRedo(List<RPDCommand.Data> _placedComponents, List<RPDCommand.Data> _removedComponents, List<RPDCommand.Data> _placedSpecialComponents = null, List<RPDCommand.Data> _removedSpecialComponents = null)
		//{
		//	if (Constants.Components.Meshes.ContainsComponent(rpdComponent))
		//	{
		//		List<RPDCommand.Data> placed = new List<RPDCommand.Data>(_placedComponents);
		//		if (_placedSpecialComponents != null)
		//			placed.AddRange(_placedSpecialComponents);
		//
		//		List<RPDCommand.Data> removed = new List<RPDCommand.Data>(_removedComponents);
		//		if (_removedSpecialComponents != null)
		//			removed.AddRange(_removedSpecialComponents);
		//
		//		//dumb workaround for meshes becaue undo/redo causes it to place the mesh once each tooth, resulting in trying to place the mesh multiple times
		//		undoRedoCommand = new RPDCommand(null, null, placed, removed);
		//	}
		//	else
		//		undoRedoCommand = new RPDCommand(_placedComponents, _removedComponents, _placedSpecialComponents, _removedSpecialComponents);
		//
		//	UndoRedoManager.Insert(undoRedoCommand);
		//}
	}

	void HandleUndoRedo(RPDComponent rpdComponent, List<RPDCommand.Data> _placedComponents, List<RPDCommand.Data> _removedComponents, List<RPDCommand.Data> _placedSpecialComponents = null, List<RPDCommand.Data> _removedSpecialComponents = null)
	{
		RPDCommand undoRedoCommand;

		if (Constants.Components.Meshes.ContainsComponent(rpdComponent))
		{
			List<RPDCommand.Data> placed = new List<RPDCommand.Data>();
			List<RPDCommand.Data> removed = new List<RPDCommand.Data>();

			//copy over components from _placedComponents
			if (_placedComponents != null)
				placed.AddRange(_placedComponents);

			if (_placedSpecialComponents != null)
				placed.AddRange(_placedSpecialComponents);

			if (_removedComponents != null)
				removed.AddRange(_removedComponents);

			if (_removedSpecialComponents != null)
				removed.AddRange(_removedSpecialComponents);

			//dumb workaround for meshes becaue undo/redo causes it to place the mesh once each tooth, resulting in trying to place the mesh multiple times
			undoRedoCommand = new RPDCommand(null, null, placed, removed);
		}
		else
			undoRedoCommand = new RPDCommand(_placedComponents, _removedComponents, _placedSpecialComponents, _removedSpecialComponents);

		UndoRedoManager.Insert(undoRedoCommand);
	}

	/// <summary>
	/// Places a component
	/// </summary>
	/// <param name="rpdComponent">Component to be placed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise. Refer to failure data for more info if false.</returns>
	public bool PlaceComponent(RPDComponent rpdComponent, int toothFDIID, out CriteriaFailureData failureData, bool createUndoRedoCommand = true, RPDPlaceable structureBeingPlaced = null)
	{
		return PlaceComponent(rpdComponent, toothFDIID, out failureData, createUndoRedoCommand, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride, structureBeingPlaced);
	}

	/// <summary>
	/// Places a component
	/// </summary>
	/// <param name="rpdComponent">Component to be placed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="placedComponentOverride">Out override List containing placed components</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise. Refer to failure data for more info if false.</returns>
	public bool PlaceComponent(RPDComponent rpdComponent, int toothFDIID, out CriteriaFailureData failureData, bool createUndoRedoCommand, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride, RPDPlaceable structureBeingPlaced = null)
	{
		return _PlaceComponent(rpdComponent, toothFDIID, out failureData, createUndoRedoCommand, out placedComponentOverride, out removedComponentOverride, false, structureBeingPlaced);
	}

	/// <summary>
	/// Places a component using an alternate mode
	/// </summary>
	/// <param name="rpdComponent">Component to be placed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise. Refer to failure data for more info if false.</returns>
	public bool PlaceComponentSpecial(RPDComponent rpdComponent, int toothFDIID, out CriteriaFailureData failureData, bool createUndoRedoCommand = true, RPDPlaceable structureBeingPlaced = null)
	{
		return PlaceComponentSpecial(rpdComponent, toothFDIID, out failureData, createUndoRedoCommand, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride, structureBeingPlaced);
	}

	/// <summary>
	/// Places a component using an alternate mode
	/// </summary>
	/// <param name="rpdComponent">Component to be placed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="placedComponentOverride">Out override List containing placed components</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise. Refer to failure data for more info if false.</returns>
	public bool PlaceComponentSpecial(RPDComponent rpdComponent, int toothFDIID, out CriteriaFailureData failureData, bool createUndoRedoCommand, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride, RPDPlaceable structureBeingPlaced = null)
	{
		return _PlaceComponent(rpdComponent, toothFDIID, out failureData, createUndoRedoCommand, out placedComponentOverride, out removedComponentOverride, true, structureBeingPlaced);
	}

	/// <summary>
	/// Removes a component
	/// </summary>
	/// <param name="rpdComponent">Component to be removed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise</returns>
	public bool RemoveComponent(RPDComponent rpdComponent, int toothFDIID, bool createUndoRedoCommand = true, RPDPlaceable structureBeingPlaced = null)
	{
		return RemoveComponent(rpdComponent, toothFDIID, createUndoRedoCommand, out List<RPDCommand.Data> removedComponentOverride, structureBeingPlaced);
	}

	/// <summary>
	/// Removes a component
	/// </summary>
	/// <param name="rpdComponent">Component to be removed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise</returns>
	public bool RemoveComponent(RPDComponent rpdComponent, int toothFDIID, bool createUndoRedoCommand, out List<RPDCommand.Data> removedComponentOverride, RPDPlaceable structureBeingPlaced = null)
	{
		PlacementData placementData = new PlacementData(rpdComponent, toothFDIID, structureBeingPlaced);

		bool success = rpdComponent.Remove(placementData, out removedComponentOverride);

		if (success && createUndoRedoCommand)
		{
			ConnectorsLogic.instance.ReSetMajorConnectors(toothFDIID, false);

			List<RPDCommand.Data> removedComponents = new List<RPDCommand.Data>();
			removedComponents.Add(new RPDCommand.Data(toothFDIID, rpdComponent));

			//replaced with HandleUndoRedo
			//RPDCommand undoRedoCommand = new RPDCommand(null, removedComponentOverride == null ? removedComponents : removedComponentOverride);
			//UndoRedoManager.Insert(undoRedoCommand);

			HandleUndoRedo(rpdComponent, null, removedComponentOverride == null ? removedComponents : removedComponentOverride);

			ActionPerformed();
		}

		OnComponentRemoved?.Invoke(Utils.FDINumberingToJawType(toothFDIID));
		return success;
	}

	/// <summary>
	/// Removes a component using an alternate mode
	/// </summary>
	/// <param name="rpdComponent">Component to be removed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise</returns>
	public bool RemoveComponentSpecial(RPDComponent rpdComponent, int toothFDIID, bool createUndoRedoCommand = true, RPDPlaceable structureBeingPlaced = null)
	{
		return RemoveComponentSpecial(rpdComponent, toothFDIID, createUndoRedoCommand, out List<RPDCommand.Data> removedComponentOverride, structureBeingPlaced);
	}

	/// <summary>
	/// Removes a component using an alternate mode
	/// </summary>
	/// <param name="rpdComponent">Component to be removed</param>
	/// <param name="toothFDIID">Tooth FDI ID</param>
	/// <param name="createUndoRedoCommand">Create an undo redo command?</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <param name="structureBeingPlaced">RPD structure being placed, e.g. assembly</param>
	/// <returns>True if sucessful, false otherwise</returns>
	public bool RemoveComponentSpecial(RPDComponent rpdComponent, int toothFDIID, bool createUndoRedoCommand, out List<RPDCommand.Data> removedComponentOverride, RPDPlaceable structureBeingPlaced = null)
	{
		PlacementData placementData = new PlacementData(rpdComponent, toothFDIID, structureBeingPlaced);

		bool success = rpdComponent.RemoveSpecial(placementData, out removedComponentOverride);

		if (success && createUndoRedoCommand)
		{
			ConnectorsLogic.instance.ReSetMajorConnectors(toothFDIID, false);

			List<RPDCommand.Data> removedSpecialComponents = new List<RPDCommand.Data>();
			removedSpecialComponents.Add(new RPDCommand.Data(toothFDIID, rpdComponent));

			//replaced by HandleUndoRedo
			//RPDCommand undoRedoCommand = new RPDCommand(null, null, null, removedSpecialComponents);
			//UndoRedoManager.Insert(undoRedoCommand);

			HandleUndoRedo(rpdComponent, null, null, null, removedSpecialComponents);

			ActionPerformed();
		}

		OnComponentRemoved?.Invoke(Utils.FDINumberingToJawType(toothFDIID));
		return success;
	}

	/// <summary>
	/// Clears all components from both jaws
	/// </summary>
	public void ClearAllComponents()
	{
		//if (DLLIntegration.instance.upperJawPresent)
		ClearComponentsFromJaw(Jaw_Type.upper_jaw);

		//if (DLLIntegration.instance.lowerJawPresent)
		ClearComponentsFromJaw(Jaw_Type.lower_jaw);
	}

	/// <summary>
	/// Clears all components from specified jaw
	/// </summary>
	/// <param name="jawType">The selected jaw</param>
	public void ClearComponentsFromJaw(Jaw_Type jawType)
	{
		//removing must be done this way for undo redo reasons


		Dictionary<RPDComponent, List<GenericTooth>> teethWithPriorityComponents = new Dictionary<RPDComponent, List<GenericTooth>>();

		//get all teeth
		List<GenericTooth> teeth = GetAllTeeth(jawType);

		/* //the commented code was intended to allow user to undo clear all components
        //find teeth with components that have special priorities
        foreach (GenericTooth tooth in teeth)
        {
            foreach (RPDComponent component in priorityList)
            {
                if (!tooth.HasComponent(component))
                    continue;

                if (teethWithPriorityComponents.TryGetValue(component, out List<GenericTooth> priorityToothList))
                    priorityToothList.Add(tooth);
                else
                    teethWithPriorityComponents.Add(component, new List<GenericTooth> { tooth });
            }
        }
        */

		foreach (GenericTooth tooth in teeth)
		{
			tooth.Reset();
		}

		//destroy all visuals after removing components
		VisualsManager.DestroyAllVisuals(jawType);

		//remove all undos and redos
		UndoRedoManager.Clear();
	}

	/// <summary>
	/// Gets GenericTooth for all teeth for specified jaw
	/// </summary>
	/// <param name="jawType">The selected jaw</param>
	/// <returns></returns>
	List<GenericTooth> GetAllTeeth(Jaw_Type jawType)
	{
		int[] upperFDIIDs = new int[] { 18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28 };
		int[] lowerFDIIDs = new int[] { 38, 37, 36, 35, 34, 33, 32, 31, 41, 42, 43, 44, 45, 46, 47, 48 };

		List<GenericTooth> result = new List<GenericTooth>();

		int[] idArray;

		switch (jawType)
		{
			case Jaw_Type.upper_jaw:
				idArray = upperFDIIDs;
				break;
			case Jaw_Type.lower_jaw:
				idArray = lowerFDIIDs;
				break;
			default:
				Logger.LogError(TypeLogError.RPD2D, $"Unable to Get All Teeth for unknown jaw type of {jawType}");
				return result;
		}

		for (int i = 0; i < idArray.Length; i++)
		{
			result.Add(DLLIntegration.instance.GetToothByIndex(idArray[i]));
		}

		return result;
	}

	/// <summary>
	/// Combines specified number of undos into one
	/// </summary>
	/// <param name="undoCombineCount"></param>
	public void CombineUndos(int undoCombineCount)
	{
		UndoRedoManager.CombineUndos(undoCombineCount);

		if (restorePointCreated)
		{
			cancelRestorePointUndoCount -= undoCombineCount;

			//combining e.g. 5 undos will result in 1 undo, got to add this back to the count
			cancelRestorePointUndoCount += 1;

			if (cancelRestorePointUndoCount < 1)
				cancelRestorePointUndoCount = 1;
		}
	}

	/// <summary>
	/// Creates a restore point that will be reverted to when cancelling out of a component placement mode
	/// </summary>
	//call when entering a placement mode
	//when returning to a cancel restore point, it will undo all actions taken after the restore point was created
	public void CreateCancelRestorePoint()
	{
		cancelRestorePointUndoCount = 0;
		restorePointCreated = true;

		RegisterUndoRedoEvent();
	}

	/// <summary>
	/// Restores to the most recently created restore point
	/// </summary>
	public void RestoreAndRemoveCancelRestorePoint()
	{
		restorePointCreated = false;
		UnregisterUndoRedoEvent();

		for (int i = 0; i < cancelRestorePointUndoCount; i++)
		{
			UndoRedoManager.Undo();
		}

		cancelRestorePointUndoCount = 0;

		UndoRedoManager.ClearRedos();
	}

	/// <summary>
	/// Removes the most recently created restore point
	/// </summary>
	public void RemoveCancelRestorePoint()
	{
		cancelRestorePointUndoCount = 0;
		restorePointCreated = false;

		UnregisterUndoRedoEvent();

		UndoRedoManager.ClearRedos();
	}

	/// <summary>
	/// Increases restore point undo count
	/// </summary>
	void ActionPerformed()
	{
		if (restorePointCreated)
		{
			if (cancelRestorePointUndoCount < 0)
				cancelRestorePointUndoCount = 0;

			IncreaseRestorePointUndoCount();
		}
	}

	/// <summary>
	/// Decreases restore point undo count
	/// </summary>
	void DecreaseRestorePointUndoCount()
	{
		if (verboseDebugMode)
			Logger.Log(TypeLog.RPD2D, $"Decreasing restore point undo count.");

		cancelRestorePointUndoCount--;
	}

	/// <summary>
	/// Increases restore point undo count
	/// </summary>
	void IncreaseRestorePointUndoCount()
	{
		if (verboseDebugMode)
			Logger.Log(TypeLog.RPD2D, $"Increasing restore point undo count.");

		cancelRestorePointUndoCount++;
	}

	/// <summary>
	/// Hooks onto UndoRedoManager's undo and redo events
	/// </summary>
	void RegisterUndoRedoEvent()
	{
		UndoRedoManager.OnUndo += DecreaseRestorePointUndoCount;
		UndoRedoManager.OnRedo += IncreaseRestorePointUndoCount;
	}

	/// <summary>
	/// Unhooks from UndoRedoManager's undo and redo events
	/// </summary>
	void UnregisterUndoRedoEvent()
	{
		UndoRedoManager.OnUndo -= DecreaseRestorePointUndoCount;
		UndoRedoManager.OnRedo -= IncreaseRestorePointUndoCount;
	}
}
