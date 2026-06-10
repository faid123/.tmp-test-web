using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using System.Linq;

[CreateAssetMenu(fileName = "Mesh Component", menuName = "Component/New Mesh Component")]
public class MeshComponent : RPDComponent
{
	//==========
	//Place Special & Remove Special will cause this component to only place/remove on a single tooth rather than the whole span.
	//==========

	public int conflictingComponentsCriteriaIndex = -1;

	[Tooltip("The index of the mesh component in the RPDComponent array that will be placed when this component is placed.")]
	public int meshRPDComponentIndex = -1;

	[Tooltip("The index of the component visuals in the Component Visuals array that will be used when this component is placed.")]
	public int componentVisualsIndex = -1;

	//used as memory variable between placing components, placing visuals and registering visuals
	List<GenericTooth> teethToChange = null;
	//used as memory variable between placing components, placing visuals and registering visuals
	Dictionary<RPDComponent, List<int>> prevConflictingMeshes = null;

	//there probably is a better way to do this
	//will have to handle this in the future
	bool performingPlaceSpecial = false;

	static readonly int[] toothFDIIDsToSkipPlacingMeshOn = new int[] { 18, 28, 38, 48 };

	public override bool AssessCriteria(PlacementData placementData, out CriteriaFailureData combinedFailureData)
	{
		//error checking for conflictingComponentsCriteriaIndex
		if (conflictingComponentsCriteriaIndex < 0 || conflictingComponentsCriteriaIndex >= criteria.Count)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Conflicting Components Criteria Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		if (meshRPDComponentIndex < 0 || meshRPDComponentIndex >= rpdComponent.Length)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Mesh RPD Component Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		if (componentVisualsIndex < 0 || componentVisualsIndex >= componentVisuals.Count)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Component Visuals Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//perform base criteria assessment
		//this should only handle conflicting components only on the clicked tooth
		if (!base.AssessCriteria(placementData, out combinedFailureData))
			return false;

		//handle conflicting components on span of teeth that will have new mesh placed
		NoConflictingComponents conflictingCompCriteria = criteria[conflictingComponentsCriteriaIndex] as NoConflictingComponents;

		if (conflictingCompCriteria == null)
		{
			Logger.LogError(TypeLogError.RPD2D, "Unable to cast Conflicting Components criteria!");
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as the Criteria at the Conflicting Components Criteria Index provided could not be cast to NoConflictingComponents.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//do checks here for nearby meshes
		teethToChange = GetTeethToChange(placementData.selectedToothFDIIndex);

		//each tooth to change, check for conflicting components
		//only expecting one component conflict per tooth
		//these should only be mesh conflicts
		Dictionary<RPDComponent, List<int>> conflictingMeshes = new Dictionary<RPDComponent, List<int>>();

		foreach (GenericTooth tooth in teethToChange)
		{
			foreach (RPDComponent conflictingComp in conflictingCompCriteria.conflictingComponents)
			{
				if (tooth.HasComponent(conflictingComp))
				{
					if (!conflictingMeshes.TryGetValue(conflictingComp, out List<int> toothFDIIDList))
					{
						List<int> conflictingToothFDIIDs = new List<int>();

						conflictingToothFDIIDs.Add(tooth.ToothIndex);

						//conflicting component not yet stored
						conflictingMeshes.Add(conflictingComp, conflictingToothFDIIDs);
					}
					else
					{
						//conflicting component alreay stored, add new tooth FDI ID
						if (!toothFDIIDList.Contains(tooth.ToothIndex))
							toothFDIIDList.Add(tooth.ToothIndex);
					}
				}
			}
		}

		if (conflictingMeshes.Count > 0)
		{
			string failureReason = $"Conflicting meshes detected.";

			List<System.Tuple<RPDComponent, List<int>>> conflictingComponentList = new List<System.Tuple<RPDComponent, List<int>>>();

			foreach (KeyValuePair<RPDComponent, List<int>> entry in conflictingMeshes)
			{
				System.Tuple<RPDComponent, List<int>> tuple = new System.Tuple<RPDComponent, List<int>>(entry.Key, entry.Value);

				conflictingComponentList.Add(tuple);
			}

			//create conflicting component failure data
			combinedFailureData = new CriteriaFailureData(failureReason, ActionUponFailure.RemoveThenPlace, conflictingComponentList.ToArray());

			//save conflicting meshes for upcoming Remove Then Place
			prevConflictingMeshes = conflictingMeshes;

			return false;
		}

		return true;
	}


	/*
	first check if being placed on empty space (no pre existing mesh)

	if being placed on empty space
		use FindAdjacentEmptyTooth to get all empty teeth
		perform SetMesh on all of them with the current default code

	if being placed on an already placed mesh
		find all adjacent teeth with the same mesh that are connected to each other (on both sides)
		go through each of those teeth, set their mesh as the newly placed mesh (just call SetMesh)
		edit the CurrentMeshList info with the newly updated info
	*/

	/*
	placing logic:
		if placed on empty space with no adjacent meshes, fill entire empty space
		if placed on empty space with adjacent meshes, fill entire empty space, change adjacent mesh groups to same type as the newly placed mesh type

		if placed on mesh that already exists, change entire matching mesh to the newly placed mesh type
	*/

	List<GenericTooth> GetTeethToChange(int toothFDIID)
	{
		List<GenericTooth> result = new List<GenericTooth>();

		//meshOnClickedTooth == null => no mesh being clicked on, need to search adjacent tooth mesh types
		//meshOnClickedTooth != null => mesh clicked on, only search for this mesh type
		bool missingToothClickedOn = GetToothMeshType(toothFDIID, out RPD_2DComponent.componentType? meshOnClickedTooth);

		if (!missingToothClickedOn)
			return result;

		GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(toothFDIID);

		result.Add(tooth);

		if (performingPlaceSpecial)
			return result;

		//if meshOnClickedTooth == null
		//means tooth being clicked on has no mesh, check adjacent teeth for meshes, get their type of mesh

		//if meshOnClickedTooth != null
		//means tooth being clicked on has mesh, check adjacent teeth for this specific mesh

		RPD_2DComponent.componentType? mesialMeshToSearchFor = null;
		RPD_2DComponent.componentType? distalMeshToSearchFor = null;

		bool searchMesial = true;
		bool searchDistal = true;

		if (meshOnClickedTooth != null)
			mesialMeshToSearchFor = distalMeshToSearchFor = meshOnClickedTooth;
		else
		{
			int mesialToothFDIID = Utils.GetNextFDIID(toothFDIID, RPDDirection.Mesial);
			int distalToothFDIID = Utils.GetNextFDIID(toothFDIID, RPDDirection.Distal);

			if (mesialToothFDIID != toothFDIID)
			{
				searchMesial = GetToothMeshType(mesialToothFDIID, out mesialMeshToSearchFor);
			}

			if (distalToothFDIID != toothFDIID)
			{
				searchDistal = GetToothMeshType(distalToothFDIID, out distalMeshToSearchFor);
			}
		}

		//get mesial missing teeth
		if (searchMesial)
		{
			List<GenericTooth> mesialTeethToChange = FindMissingOrMeshTeeth(toothFDIID, RPDDirection.Mesial, mesialMeshToSearchFor);
			result.AddRange(mesialTeethToChange);
		}

		//get distal missing teeth
		if (searchDistal)
		{
			List<GenericTooth> distalTeethToChange = FindMissingOrMeshTeeth(toothFDIID, RPDDirection.Distal, distalMeshToSearchFor);
			result.AddRange(distalTeethToChange);
		}

		return result;



		bool GetToothMeshType(int _toothFDIID, out RPD_2DComponent.componentType? meshType)
		{
			meshType = null;

			GenericTooth _tooth = DLLIntegration.instance.GetToothByIndex(_toothFDIID);

			if (_tooth.presence != Tooth_Presence.missing)
				return false;

			if (_tooth.HasComponent(out List<RPD_2DComponent.componentType> meshesDetected, Constants.Components.Meshes))
				//mesh detected on tooth being clicked
				meshType = meshesDetected[0]; //there should only be one mesh per tooth

			return true;
		}

		//output list does not include toothFDIID's tooth
		List<GenericTooth> FindMissingOrMeshTeeth(int _toothFDIID, RPDDirection direction, RPD_2DComponent.componentType? componentToSearchFor)
		{
			//meshToSearchFor = null -> just search for missing teeth
			//meshToSearchFor != null -> search for consecutive teeth with that mesh type

			GenericTooth consecutiveTooth = null;

			List<GenericTooth> _result = new List<GenericTooth>();

			int nextToothFDIID = Utils.GetNextFDIID(_toothFDIID, direction);

			//make sure not at final tooth
			if (nextToothFDIID == _toothFDIID)
				return _result;

			int currentToothPatchID = Utils.FDINumberingToPatchID(_toothFDIID, out Jaw_Type jawType);
			int nextToothPatchID = Utils.FDINumberingToPatchID(nextToothFDIID);
			int searchDirection = currentToothPatchID > nextToothPatchID ? -1 : 1;

			//_toothFDIID = nextToothFDIID;

			do
			{
				//consecutiveTooth = DLLIntegration.instance.GetToothByIndex(_toothFDIID);
				consecutiveTooth = DLLIntegration.instance.GetToothByIndex(Utils.PatchIDToFDINumbering(nextToothPatchID, jawType));

				switch (componentToSearchFor)
				{
					case null:
						if (consecutiveTooth.presence == Tooth_Presence.missing)
							_result.Add(consecutiveTooth);
						else
							return _result;
						break;
					default:
						if (consecutiveTooth.HasComponent((RPD_2DComponent.componentType)componentToSearchFor))
							_result.Add(consecutiveTooth);
						else
							return _result;
						break;
				}

				//nextToothFDIID = Utils.GetNextFDIID(_toothFDIID, direction);
				nextToothPatchID += searchDirection;

				//make sure not at final tooth
				//if (nextToothFDIID != _toothFDIID)
				if (nextToothPatchID < 0 || nextToothPatchID >= 16) //patch id goes from 0 - 15
					break;
			}
			while (consecutiveTooth.presence == Tooth_Presence.missing);

			return _result;
		}
	}

	public override bool PlaceSpecial(PlacementData placementData, out CriteriaFailureData failureData, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride)
	{
		//there probably is a better way to do this
		//will have to handle this in the future
		//when performingPlaceSpecial == true, GetTeethToChange only returns the tooth being clicked on
		performingPlaceSpecial = true;

		bool success = Place(placementData, out failureData, out placedComponentOverride, out removedComponentOverride);

		performingPlaceSpecial = false;

		return success;
	}

	protected override void PerformPlacing(PlacementData placementData, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride)
	{
		//before this, AssessCriteria should have caused RPDManager to perform a Remove then Place
		//so we can assume that the teeth are now mesh-free

		removedComponentOverride = null;
		placedComponentOverride = new List<RPDCommand.Data>();

		teethToChange = GetTeethToChange(placementData.selectedToothFDIIndex);

		//if there is more than 1 tooth that needs mesh, remove the teeth w/ FDI ID minor index of 8 from the list
		//unless it is the tooth that was clicked on by the user
		if (teethToChange.Count > 1)
		{
			for (int i = teethToChange.Count - 1; i >= 0; i--)
			{
				GenericTooth tooth = teethToChange[i];

				//ignore the tooth that was being clicked on, this tooth should always have a mesh on it
				if (placementData.selectedToothFDIIndex == tooth.ToothIndex)
					continue;

				if (toothFDIIDsToSkipPlacingMeshOn.Contains(tooth.ToothIndex))
				{
					bool previouslyHadMesh = false;

					if (prevConflictingMeshes != null)
						//check if it previously had a mesh
						foreach (KeyValuePair<RPDComponent, List<int>> entry in prevConflictingMeshes)
						{
							if (entry.Value.Contains(tooth.ToothIndex))
							{
								previouslyHadMesh = true;
								break;
							}
						}

					if (!previouslyHadMesh)
						teethToChange.RemoveAt(i);
				}
			}
		}

		foreach (GenericTooth tooth in teethToChange)
		{
			tooth.SetComponent(rpdComponent[meshRPDComponentIndex]);

			RPDCommand.Data placedData = new RPDCommand.Data(tooth.ToothIndex, this);
			placedComponentOverride.Add(placedData);
		}

		prevConflictingMeshes = null;
	}

	protected override void HandlePlacingSprites(PlacementData placementData, out List<GameObject> spriteGameObjects)
	{
		spriteGameObjects = new List<GameObject>();

		foreach (GenericTooth tooth in teethToChange)
		{
			int spriteIndex = Utils.ToothFDIIDToComponentVisualsSpriteID(tooth.ToothIndex, out Jaw_Type jawType);

			ComponentVisuals visuals = componentVisuals[componentVisualsIndex];

			PlaceSprite(tooth.ToothIndex, displayName, jawType, visuals, spriteIndex, out GameObject spriteGameObject);

			spriteGameObjects.Add(spriteGameObject);
		}
	}

	protected override void HandleRegisteringVisuals(PlacementData placementData, List<GameObject> spriteGameObjects)
	{
		for (int i = 0; i < spriteGameObjects.Count; i++)
		{
			GameObject spriteGameObject = spriteGameObjects[i];
			GenericTooth tooth = teethToChange[i];

			VisualsManager.RegisterVisuals(tooth.ToothIndex, this, spriteGameObject);
		}
	}

	//Remove will remove the entire span of the same mesh
	public override bool Remove(PlacementData placementData, out List<RPDCommand.Data> removedComponentOverride)
	{
		removedComponentOverride = new List<RPDCommand.Data>();

		int removeCount = 0;

		teethToChange = GetTeethToChange(placementData.selectedToothFDIIndex);

		foreach (GenericTooth tooth in teethToChange)
		{
			bool ableToRemoveComponent = tooth.RemoveComponent(rpdComponent[meshRPDComponentIndex]);

			if (ableToRemoveComponent)
			{
				RPDCommand.Data removeData = new RPDCommand.Data(tooth.ToothIndex, this);
				removedComponentOverride.Add(removeData);

				//remove visuals
				VisualsManager.DestroyVisuals(tooth.ToothIndex, this);

				removeCount++;
			}
		}

		//return true if at least one mesh was removed
		return removeCount > 0;
	}

	//RemoveSpecial will remove the same mesh only at this place
	public override bool RemoveSpecial(PlacementData placementData, out List<RPDCommand.Data> removedComponentOverride)
	{
		removedComponentOverride = null;

		GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(placementData.selectedToothFDIIndex);

		bool ableToRemoveComponent = tooth.RemoveComponent(rpdComponent[meshRPDComponentIndex]);

		if (ableToRemoveComponent)
			//remove visuals
			VisualsManager.DestroyVisuals(placementData.selectedToothFDIIndex, this);

		return ableToRemoveComponent;
	}
}
