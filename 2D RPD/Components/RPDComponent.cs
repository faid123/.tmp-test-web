using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using Constants;

[System.Serializable]
public class ComponentVisuals
{
	public string name;

	public Enums.VisualsDirectionTag direction = Enums.VisualsDirectionTag.None;
	public Enums.VisualsMaterialTag material = Enums.VisualsMaterialTag.None;
	public Enums.VisualsPositionTag position = Enums.VisualsPositionTag.None;

	[HideInInspector]
	public List<Visuals> upperJawVisuals
	{
		get
		{
			return new List<Visuals>() { tooth18_28, tooth17_27, tooth16_26, tooth15_25, tooth14_24, tooth13_23, tooth12_22, tooth11_21 };
		}
	}
	[HideInInspector]
	public List<Visuals> lowerJawVisuals
	{
		get
		{
			return new List<Visuals>() { tooth38_48, tooth37_47, tooth36_46, tooth35_45, tooth34_44, tooth33_43, tooth32_42, tooth31_41 };
		}
	}

	[Header("Upper Jaw")]
	public Visuals tooth18_28 = new Visuals(); //patch id 0
	public Visuals tooth17_27 = new Visuals(); //patch id 1
	public Visuals tooth16_26 = new Visuals(); //patch id 2
	public Visuals tooth15_25 = new Visuals(); //patch id 3
	public Visuals tooth14_24 = new Visuals(); //patch id 4
	public Visuals tooth13_23 = new Visuals(); //patch id 5
	public Visuals tooth12_22 = new Visuals(); //patch id 6
	public Visuals tooth11_21 = new Visuals(); //patch id 7
											   //patch id 8 - 15 are missing because sprites are just flipped when being displayed

	[Header("Lower Jaw")]
	public Visuals tooth38_48 = new Visuals(); //patch id 0
	public Visuals tooth37_47 = new Visuals(); //patch id 1
	public Visuals tooth36_46 = new Visuals(); //patch id 2
	public Visuals tooth35_45 = new Visuals(); //patch id 3
	public Visuals tooth34_44 = new Visuals(); //patch id 4
	public Visuals tooth33_43 = new Visuals(); //patch id 5
	public Visuals tooth32_42 = new Visuals(); //patch id 6
	public Visuals tooth31_41 = new Visuals(); //patch id 7
											   //patch id 8 - 15 are missing because sprites are just flipped when being displayed

	public void Clear()
	{
		name = "";

		tooth18_28 = new Visuals();
		tooth17_27 = new Visuals();
		tooth16_26 = new Visuals();
		tooth15_25 = new Visuals();
		tooth14_24 = new Visuals();
		tooth13_23 = new Visuals();
		tooth12_22 = new Visuals();
		tooth11_21 = new Visuals();

		tooth38_48 = new Visuals();
		tooth37_47 = new Visuals();
		tooth36_46 = new Visuals();
		tooth35_45 = new Visuals();
		tooth34_44 = new Visuals();
		tooth33_43 = new Visuals();
		tooth32_42 = new Visuals();
		tooth31_41 = new Visuals();
	}
}

[CreateAssetMenu(fileName = "RPD Component", menuName = "Component/New RPD Component")]
public class RPDComponent : RPDPlaceable
{
	[Tooltip("The name that will be displayed when interacting with this component.")]
	public string displayName;

	[Tooltip("Array of all the component types this RPD Component will encompass. " +
		"E.g. T-bar RPD Component should include rb_T_distal and rb_T_mesial. " +
		"Just include a single component if there are no variations of it.")]
	public RPD_2DComponent.componentType[] rpdComponent;

	public List<Criteria> criteria = new List<Criteria>();

	public List<ComponentVisuals> componentVisuals = new List<ComponentVisuals>();

	/// <summary>
	/// Assesses the criteria for placing this component
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="combinedFailureData">Out failure data</param>
	/// <returns>True if criteria is met, false otherwise. Refer to failure data for more info if false.</returns>
	public virtual bool AssessCriteria(PlacementData placementData, out CriteriaFailureData combinedFailureData)
	{
		combinedFailureData = null;

		bool passedAllChecks = true;

		foreach (Criteria _criteria in criteria)
		{
			if (!_criteria.Assess(placementData, out CriteriaFailureData _failureData))
			{
				passedAllChecks = false;

				if (combinedFailureData == null)
					combinedFailureData = _failureData;
				else
					combinedFailureData.CombineWith(_failureData);
			}
		}

		return passedAllChecks;
	}

	/// <summary>
	/// Places this component
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="placedComponentOverride">Out override List containing placed components</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <returns>True if successful, false otherwise. Refer to failure data for more info if false.</returns>
	public virtual bool Place(PlacementData placementData, out CriteriaFailureData failureData, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride)
	{
		placedComponentOverride = null;
		removedComponentOverride = null;

		if (!AssessCriteria(placementData, out failureData))
			//do not handle Remove Then Place here, handled in RPDManager
			return false;

		PerformPlacing(placementData, out placedComponentOverride, out removedComponentOverride);

		//show visuals
		ShowVisuals(placementData);

		return true;
	}

	/// <summary>
	/// Used as an alternate way to place the component.
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="failureData">Out failure data</param>
	/// <param name="placedComponentOverride">Out override List containing placed components</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <returns>True if successful, false otherwise. Refer to failure data for more info if false.</returns>
	public virtual bool PlaceSpecial(PlacementData placementData, out CriteriaFailureData failureData, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride)
	{
		return Place(placementData, out failureData, out placedComponentOverride, out removedComponentOverride);
	}

	/// <summary>
	/// Function that handles placing of this component, to be overridden if component requires special functionality
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="placedComponentOverride">Out override List containing placed components</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	protected virtual void PerformPlacing(PlacementData placementData, out List<RPDCommand.Data> placedComponentOverride, out List<RPDCommand.Data> removedComponentOverride)
	{
		placedComponentOverride = null;
		removedComponentOverride = null;

		GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(placementData.selectedToothFDIIndex);

		tooth.SetComponent(placementData.component.rpdComponent[0]);
	}

	/// <summary>
	/// Removes this component
	/// </summary>
	/// <param name="placementData">The relevant info related to removing this component</param>
	/// <param name="removedComponentOverride">Out override List containing removed components</param>
	/// <returns>True if successful, false otherwise</returns>
	public virtual bool Remove(PlacementData placementData, out List<RPDCommand.Data> removedComponentOverride)
	{
		removedComponentOverride = null;

		GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(placementData.selectedToothFDIIndex);

		if (RPDManager.instance.verboseDebugMode)
			Logger.Log(TypeLog.RPD2D, $"Removing {displayName} on tooth {placementData.selectedToothFDIIndex}");

		bool ableToRemoveComponent = tooth.RemoveComponent(placementData.component.rpdComponent[0]);

		if (ableToRemoveComponent)
		{
			//remove visuals
			VisualsManager.DestroyVisuals(placementData.selectedToothFDIIndex, placementData.component);
		}
		else
		{
			if (RPDManager.instance.verboseDebugMode)
				Logger.LogError(TypeLogError.RPD2D, $"Unable to remove {displayName} on tooth {placementData.selectedToothFDIIndex}");
		}

		return ableToRemoveComponent;
	}

	/// <summary>
	/// Used as an alternate way to remove the component.
	/// To be overridden in child classes if this functionality is needed.
	/// </summary>
	/// <param name="placementData">The relevant info related to removing this component</param>
	/// <returns>True if successful, false otherwise.</returns>
	public virtual bool RemoveSpecial(PlacementData placementData, out List<RPDCommand.Data> removedComponentOverride)
	{
		return Remove(placementData, out removedComponentOverride);
    }

	/// <summary>
	/// Shows the visuals of this component
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	protected virtual void ShowVisuals(PlacementData placementData)
	{
		HandlePlacingSprites(placementData, out List<GameObject> spriteGameObjects);

		HandleRegisteringVisuals(placementData, spriteGameObjects);

		HandleAddingComponentSelect(placementData, spriteGameObjects);
	}

	/// <summary>
	/// Handles sprite placing sequence
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="spriteGameObjects">Out List of sprites placed</param>
	protected virtual void HandlePlacingSprites(PlacementData placementData, out List<GameObject> spriteGameObjects)
	{
		spriteGameObjects = null;

		//find the patch ID of the tooth
		//the patch ID will correspond to the entry number in the visuals array
		int spriteIndex = Utils.ToothFDIIDToComponentVisualsSpriteID(placementData.selectedToothFDIIndex, out Jaw_Type jawType);

		PlaceSprite(placementData, jawType, componentVisuals[0], spriteIndex, out GameObject spriteGameObject);

		spriteGameObjects = new List<GameObject>() { spriteGameObject };
	}

	/// <summary>
	/// Places sprite
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="jawType">The jaw type</param>
	/// <param name="singleComponentVisuals">Data for specific sprite that is being placed</param>
	/// <param name="spriteIndex">Index of sprite for specific tooth</param>
	/// <param name="spriteGameObject">Out GameObject of placed sprite</param>
	protected virtual void PlaceSprite(PlacementData placementData, Jaw_Type jawType, ComponentVisuals singleComponentVisuals, int spriteIndex, out GameObject spriteGameObject)
	{
		PlaceSprite(placementData.selectedToothFDIIndex, placementData.component.displayName, jawType, singleComponentVisuals, spriteIndex, out spriteGameObject);
	}

	/// <summary>
	/// Places sprite
	/// </summary>
	/// <param name="toothFDIIndex">The tooth FDI ID</param>
	/// <param name="spriteGameObjectName">Name of GameObject of placed sprite</param>
	/// <param name="jawType">The jaw type</param>
	/// <param name="singleComponentVisuals">Data for specific sprite that is being placed</param>
	/// <param name="spriteIndex">Index of sprite for specific tooth</param>
	/// <param name="spriteGameObject">Out GameObject of placed sprite</param>
	protected virtual void PlaceSprite(int toothFDIIndex, string spriteGameObjectName, Jaw_Type jawType, ComponentVisuals singleComponentVisuals, int spriteIndex, out GameObject spriteGameObject)
	{

		spriteGameObject = null;

		List<Visuals> jawVisualsList = null;

		switch (jawType)
		{
			case Jaw_Type.upper_jaw:
				jawVisualsList = singleComponentVisuals.upperJawVisuals;
				break;
			case Jaw_Type.lower_jaw:
				jawVisualsList = singleComponentVisuals.lowerJawVisuals;
				break;
			default:
				Logger.LogError(TypeLogError.General, $"Unexpected Jaw_Type of {jawType}. Unable to show visuals.");
				return;
		}

		//determine which set of Visuals to use for this particular tooth
		Visuals visuals = jawVisualsList[spriteIndex];

		HandleSpriteCreation(visuals, toothFDIIndex, spriteGameObjectName, out spriteGameObject);
	}

	/// <summary>
	/// Handles sequence of registering sprites with the visuals manager
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="spriteGameObjects">List of GameObjects with sprites to be registered</param>
	protected virtual void HandleRegisteringVisuals(PlacementData placementData, List<GameObject> spriteGameObjects)
	{
		foreach (GameObject spriteGameObject in spriteGameObjects)
		{
			VisualsManager.RegisterVisuals(placementData.selectedToothFDIIndex, placementData.component, spriteGameObject);
		}
	}

	/// <summary>
	/// Handles adding ComponentSelect component
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="spriteGameObjects">List of GameObjects with sprites to be processed</param>
	protected virtual void HandleAddingComponentSelect(PlacementData placementData, List<GameObject> spriteGameObjects)
	{
		foreach (GameObject spriteGameObject in spriteGameObjects)
		{
			AddComponentSelect(spriteGameObject, placementData);
		}
	}

	/// <summary>
	/// Handles creating sprites in the scene
	/// </summary>
	/// <param name="visuals">Sprite data</param>
	/// <param name="toothFDIIndex">The tooth FDI ID</param>
	/// <param name="spriteGameObjectName">Name of GameObject being created</param>
	/// <param name="spriteGameObj">Out created sprite GameObject</param>
	protected virtual void HandleSpriteCreation(Visuals visuals, int toothFDIIndex, string spriteGameObjectName, out GameObject spriteGameObj)
	{
		GenericTooth tooth = DLLIntegration.instance.GetToothByIndex(toothFDIIndex);

		spriteGameObj = new GameObject($"{spriteGameObjectName} Sprite");
		spriteGameObj.transform.SetParent(tooth.transform);
		spriteGameObj.transform.localPosition = visuals.positionOffset;
		spriteGameObj.transform.localRotation = Quaternion.Euler(visuals.rotationOffset);
		spriteGameObj.transform.localScale = visuals.scale;

		if (!spriteGameObj.TryGetComponent<RectTransform>(out RectTransform spriteGORectTransform))
			spriteGORectTransform = spriteGameObj.AddComponent<RectTransform>();
		//RectTransform spriteGORectTransform = spriteGameObj.GetComponent<RectTransform>();
		//Rect spriteGORect = spriteGORectTransform.rect;
		//spriteGORectTransform.rect.Set(spriteGORect.x, spriteGORect.y, spriteData.width, spriteData.height);
		spriteGORectTransform.sizeDelta = new Vector2(visuals.width, visuals.height);

		Image image = spriteGameObj.AddComponent<Image>();
		image.sprite = visuals.sprite;
		image.color = visuals.color;
	}

	/// <summary>
	/// Adds ComponentSelect component
	/// </summary>
	/// <param name="spriteGameObject">GameObject with sprite to be processed</param>
	/// <param name="placementData">The relevant info related to placing this component</param>
	protected virtual void AddComponentSelect(GameObject spriteGameObject, PlacementData placementData)
	{
		ComponentSelect compSelect = spriteGameObject.AddComponent<ComponentSelect>();
		compSelect.rpdComponent = placementData.component;
	}
}
