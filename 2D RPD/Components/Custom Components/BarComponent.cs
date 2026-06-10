using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "Bar Component", menuName = "Component/New Bar Component")]
public class BarComponent : RPDComponent
{
	enum Location
	{
		Tip,
		Mid,
		Root
	}

	//currently, DLL does not take into account where bar 'mid' sections are or where they start
	//DLL only cares about where they end and the type of bar it is


	//however on our end we will still need to use rb_end and rb_mid for checks...?

	[Header("Criteria Indices")]
	public int conflictingComponentsCriteriaIndex = -1;

	[Header("Component Indices")]
	public int tipMesialRPDComponentIndex = -1;
	public int tipDistalRPDComponentIndex = -1;
	[Space]
	public int midRPDComponentIndex = -1;
	[Space]
	public int rootMesialRPDComponentIndex = -1;
	public int rootDistalRPDComponentIndex = -1;

	[Header("Visuals Indices")]
	public int[] barRootComponentVisualsIndices;
	public int barMidcomponentVisualsIndex = -1;
	public int[] barTipComponentVisualsIndices;

	int maxDistanceFromMesh = 2;

	RPD_2DComponent.componentType[] rootAndMidConflictingComponents =
		new RPD_2DComponent.componentType[]
	{
		RPD_2DComponent.componentType.rb_mid,
		RPD_2DComponent.componentType.rb_end_distal,
		RPD_2DComponent.componentType.rb_end_mesial,
		RPD_2DComponent.componentType.rb_bar_end_mesial
	};

	//working memory between function calls
	List<int> validBarRootFDIIDs = new List<int>();
	//tooth FDIIDs going in sequence from tip to root
	List<int> toothFDIIDs = new List<int>();
	RPDDirection tipDirection;
	RPDDirection rootDirection;

	public override bool AssessCriteria(PlacementData placementData, out CriteriaFailureData combinedFailureData)
	{
		//clear valid root list
		validBarRootFDIIDs = new List<int>();

		GenericTooth toothClickedOn = DLLIntegration.instance.GetToothByIndex(placementData.selectedToothFDIIndex);

		//checks if tooth is present
		if (toothClickedOn.presence == Tooth_Presence.missing)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as tooth is not present.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//error checking for tipMesialRPDComponentIndex
		if (tipMesialRPDComponentIndex < 0 || tipMesialRPDComponentIndex >= rpdComponent.Length)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Tip Mesial RPD Component Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//error checking for tipDistalRPDComponentIndex
		if (tipDistalRPDComponentIndex < 0 || tipDistalRPDComponentIndex >= rpdComponent.Length)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Tip Distal RPD Component Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//error checking for midRPDComponentIndex
		if (midRPDComponentIndex < 0 || midRPDComponentIndex >= rpdComponent.Length)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Mid RPD Component Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//error checking for rootMesialRPDComponentIndex
		if (rootMesialRPDComponentIndex < 0 || rootMesialRPDComponentIndex >= rpdComponent.Length)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Root Mesial RPD Component Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//error checking for rootDistalRPDComponentIndex
		if (rootDistalRPDComponentIndex < 0 || rootDistalRPDComponentIndex >= rpdComponent.Length)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Root Distal RPD Component Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//error checking for conflictingComponentsCriteriaIndex
		if (conflictingComponentsCriteriaIndex < 0 || conflictingComponentsCriteriaIndex >= criteria.Count)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as Conflicting Components Criteria Index is not set to a valid number.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		//check if tooth already has a conflicting component
		//if (!criteria[conflictingComponentsCriteriaIndex].Assess(placementData, out combinedFailureData))
		//	return false;

		//perform base criteria assessment
		if (!base.AssessCriteria(placementData, out combinedFailureData))
			return false;

		validBarRootFDIIDs = GetValidBarRootFDIIDs(placementData.selectedToothFDIIndex);

		if (validBarRootFDIIDs.Count == 0)
		{
			combinedFailureData = new CriteriaFailureData($"Unable to place {displayName} on {placementData.selectedToothFDIIndex} as there are no valid nearby meshes available.",
														ActionUponFailure.PreventPlacement);
			return false;
		}

		return true;
	}

	List<int> GetValidBarRootFDIIDs(int selectedToothFDIIndex)
	{
		//get teeth in range
		List<int> nearbyTeethFDIIDs = Utils.GetNearbyTeethFDIIDs(selectedToothFDIIndex, maxDistanceFromMesh);

		//check if teeth in range have meshes on them
		//remove the ones that do not
		//check if teeth in range have rb_mid or rb_end
		//remove the ones that do
		for (int i = nearbyTeethFDIIDs.Count - 1; i >= 0; i--)
		{
			int nearbyToothFDIID = nearbyTeethFDIIDs[i];

			GenericTooth nearbyTooth = DLLIntegration.instance.GetToothByIndex(nearbyToothFDIID);

			if (!nearbyTooth.HasComponent(Constants.Components.Meshes))
			{
				nearbyTeethFDIIDs.Remove(nearbyToothFDIID);
				continue;
			}

			//of all the meshes that are nearby, check those for rb_mid and rb_end
			if (nearbyTooth.HasComponent(rootAndMidConflictingComponents))
			{
				nearbyTeethFDIIDs.Remove(nearbyToothFDIID);
				continue;
			}
		}

		return nearbyTeethFDIIDs;
	}

	/// <summary>
	/// Calculates the best rootFDIID to use based on dental rules.
	/// Rule: A bar will always originate from the closest mesh component. 
	/// If there are two mesh components in equal distance from the target tooth, 
	/// the distal direction will be prioritized.
	/// </summary>
	/// <param name="tipFDIID">The tooth where the bar tip will be placed</param>
	/// <param name="validRootFDIIDs">List of valid root candidates</param>
	/// <returns>The best rootFDIID to use</returns>
	private int CalculateBestRootFDIID(int tipFDIID, List<int> validRootFDIIDs)
	{
		// If only one option, return it
		if (validRootFDIIDs.Count == 1)
		{
			return validRootFDIIDs[0];
		}

		// Find the closest tooth(es) by calculating distance
		int minDistance = int.MaxValue;
		List<int> closestTeeth = new List<int>();

		foreach (int candidateRootFDIID in validRootFDIIDs)
		{
			int distance = Utils.GetDistanceBetween(tipFDIID, candidateRootFDIID);

			if (distance < minDistance)
			{
				// Found a closer tooth, clear list and add this one
				minDistance = distance;
				closestTeeth.Clear();
				closestTeeth.Add(candidateRootFDIID);
			}
			else if (distance == minDistance)
			{
				// Found another tooth at the same distance
				closestTeeth.Add(candidateRootFDIID);
			}
		}

		// If only one closest tooth, return it
		if (closestTeeth.Count == 1)
		{
			return closestTeeth[0];
		}

		// Multiple teeth at equal distance - prioritize distal direction
		int bestRootFDIID = -1;

		foreach (int candidateRootFDIID in closestTeeth)
		{
			RPDDirection direction = (RPDDirection)Utils.GetDirection(tipFDIID, candidateRootFDIID);

			// Prioritize distal direction
			if (direction == RPDDirection.Distal)
			{
				bestRootFDIID = candidateRootFDIID;
				break; // Distal has priority, so we can stop here
			}

			// Keep track of mesial option as fallback
			if (bestRootFDIID == -1)
			{
				bestRootFDIID = candidateRootFDIID;
			}
		}

		return bestRootFDIID;
	}

	protected override void PerformPlacing(PlacementData placementData, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride)
	{
		placedComponentOverride = null;
		removedComponentOverride = null;

		int tipFDIID = placementData.selectedToothFDIIndex;
		int rootFDIID = CalculateBestRootFDIID(tipFDIID, validBarRootFDIIDs);

		//based on nearbyTeethFDIIDs, use the calculated best root tooth
		tipDirection = (RPDDirection)Utils.GetDirection(tipFDIID, rootFDIID);

		//catching outliers, appearing as broken since tip vs root are coming from other side of the jaw
		if (tipFDIID == 11 || tipFDIID == 31 || tipFDIID == 12 || tipFDIID == 32)
		{
			//if root is from the other side, crossing the mid line. force it to go mesial
			if (rootFDIID == 21 || rootFDIID == 41 || rootFDIID == 22 || rootFDIID == 42)//(rootFDIID >= 21 && rootFDIID <= 30) || rootFDIID >= 41)
			{ rootDirection = RPDDirection.Mesial; UnityEngine.Debug.Log("setting left mesial root"); }
			else
				rootDirection = tipDirection == RPDDirection.Distal ? RPDDirection.Mesial : RPDDirection.Distal; //rootDirection = RPDDirection.Distal; UnityEngine.Debug.Log("setting left distal root"); }
		}
		else if (tipFDIID == 21 || tipFDIID == 41 || tipFDIID == 22 || tipFDIID == 42)
		{
			//if root is from the other side, crossing the mid line. force it to go mesial
			if (rootFDIID == 11 || rootFDIID == 31 || rootFDIID == 12 || rootFDIID == 32) //(rootFDIID >= 11 && rootFDIID <= 20) || (rootFDIID >= 31 && rootFDIID <= 40))
			{ rootDirection = RPDDirection.Mesial; UnityEngine.Debug.Log("setting right mesial root"); }
			else
				rootDirection = tipDirection == RPDDirection.Distal ? RPDDirection.Mesial : RPDDirection.Distal; //rootDirection = RPDDirection.Distal; UnityEngine.Debug.Log("setting right distal root"); }
		}
		else
			rootDirection = tipDirection == RPDDirection.Distal ? RPDDirection.Mesial : RPDDirection.Distal;

		int tipComponentIndex = tipDirection == RPDDirection.Distal ? tipDistalRPDComponentIndex : tipMesialRPDComponentIndex;
		int rootComponentIndex = rootDirection == RPDDirection.Distal ? rootDistalRPDComponentIndex : rootMesialRPDComponentIndex;

		//tooth FDIIDs going in sequence from tip to root
		toothFDIIDs = Utils.GetFDIIndicesOfTeethFrom(tipFDIID, rootFDIID);

		for (int i = 0; i < toothFDIIDs.Count; i++)
		{
			GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(toothFDIIDs[i]);

			//check if placing tip
			if (i == 0)
			{
				tooth.SetComponent(rpdComponent[tipComponentIndex]);
			}
			//check if placing root
			else if (i == toothFDIIDs.Count - 1)
			{
				tooth.SetComponent(rpdComponent[rootComponentIndex]);
			}
			//is placing mid
			else
			{
				tooth.SetComponent(rpdComponent[midRPDComponentIndex]);
			}
		}
	}

	//might have to override showvisuals
	//place root -> 

	protected override void HandlePlacingSprites(PlacementData placementData, out List<GameObject> spriteGameObjects)
	{
		spriteGameObjects = new List<GameObject>();

		int tipVisualsIndex = -1;
		int rootVisualsIndex = -1;

		foreach (int tipIndex in barTipComponentVisualsIndices)
		{
			ComponentVisuals visuals = componentVisuals[tipIndex];

			if ((int)visuals.direction == (int)tipDirection)
			{
				tipVisualsIndex = tipIndex;
				break;
			}
		}

		foreach (int rootIndex in barRootComponentVisualsIndices)
		{
			ComponentVisuals visuals = componentVisuals[rootIndex];

			if ((int)visuals.direction == (int)rootDirection)
			{
				rootVisualsIndex = rootIndex;
				break;
			}
		}


		//tooth FDIIDs going in sequence from tip to root
		for (int i = 0; i < toothFDIIDs.Count; i++)
		{
			int toothFDIID = toothFDIIDs[i];

			int spriteIndex = Utils.ToothFDIIDToComponentVisualsSpriteID(toothFDIID, out Jaw_Type jawType);

			ComponentVisuals visuals;

			//check if placing tip
			if (i == 0)
			{
				visuals = componentVisuals[tipVisualsIndex];
			}
			//check if placing root
			else if (i == toothFDIIDs.Count - 1)
			{
				visuals = componentVisuals[rootVisualsIndex];
			}
			//is placing mid
			else
			{
				visuals = componentVisuals[barMidcomponentVisualsIndex];
			}

			PlaceSprite(toothFDIID, placementData.component.displayName, jawType, visuals, spriteIndex, out GameObject spriteGameObject);

			spriteGameObjects.Add(spriteGameObject);
		}
	}

	protected override void AddComponentSelect(GameObject spriteGameObject, PlacementData placementData)
	{
		ComponentSelect compSelect = spriteGameObject.AddComponent<ComponentSelect>();
		compSelect.rpdComponent = placementData.component;
		//set tooth override so when clicking on the root/bar, the RPD system gets directed to the tip where the component is placed instead
		compSelect.toothOverride = DLLIntegration.instance.GetToothByIndex(placementData.selectedToothFDIIndex);
	}

	public override bool Remove(PlacementData placementData, out List<RPDCommand.Data> removedComponentOverride)
	{
		removedComponentOverride = null;

		RPDDirection direction;
		int toothFDIID = placementData.selectedToothFDIIndex;

		//remove tip
		GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(toothFDIID);

		//try to remove the tip if it is mesial
		bool ableToRemoveComponent = tooth.RemoveComponent(rpdComponent[tipMesialRPDComponentIndex]);
		direction = RPDDirection.Mesial;

		//try to remove the tip if it is distal
		if (!ableToRemoveComponent)
		{
			//unable to remove mesial, try remove distal
			ableToRemoveComponent = tooth.RemoveComponent(rpdComponent[tipDistalRPDComponentIndex]);
			direction = RPDDirection.Distal;
		}

		//check if tip was able to be removed
		if (!ableToRemoveComponent)
		{
			//was not able to remove tip, something is wrong
			Logger.LogError(TypeLogError.RPD2D, $"Unable to remove {placementData.component.displayName} tip.");
			return false;
		}

		//remove rb_mid
		GetNextTooth();
		ableToRemoveComponent = tooth.RemoveComponent(rpdComponent[midRPDComponentIndex]);

		if (ableToRemoveComponent)
		{
			//was able to remove mid, move on to next tooth
			GetNextTooth();
		}

		//remove rb_end (root)
		//try remove mesial
		ableToRemoveComponent = tooth.RemoveComponent(rpdComponent[rootMesialRPDComponentIndex]);

		//try to remove the root if it is distal
		if (!ableToRemoveComponent)
		{
			//unable to remove mesial, try remove distal
			ableToRemoveComponent = tooth.RemoveComponent(rpdComponent[rootDistalRPDComponentIndex]);
		}

		//check if tip was able to be removed
		if (!ableToRemoveComponent)
		{
			//was not able to remove tip, something is wrong
			Logger.LogError(TypeLogError.RPD2D, $"Unable to remove {placementData.component.displayName} root.");
			return false;
		}

		if (ableToRemoveComponent)
		{
			//remove visuals
			VisualsManager.DestroyVisuals(placementData.selectedToothFDIIndex, placementData.component);
		}

		return true;

		void GetNextTooth()
		{
			toothFDIID = Utils.GetNextFDIID(toothFDIID, direction);
			tooth = DLLIntegration.instance.GetToothByIndex(toothFDIID);
		}
	}
}
