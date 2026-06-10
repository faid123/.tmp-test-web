using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEngine.UI;
using Constants;

#if UNITY_EDITOR
public class SpriteHelper : ScriptableWizard
{
	[MenuItem("2D RPD Helpers/Sprite Helper")]
	static void CreateWizard()
	{
		ScriptableWizard.DisplayWizard<SpriteHelper>("Populate Sprite Data", "Populate And Close Window", "Populate");
	}

	public RPDComponent componentToPopulate;

	[Tooltip("If set to true, Component Visuals with the same name as the supplied Component Visuals Name will be overwritten. " +
		"If set to false, null tooth image entries will not be copied over.")]
	public bool clearIfNamesMatch = false;

	public string componentVisualsName;

	[Header("Tag Settings")]
	public bool setDirectionTags = false;
	public Enums.VisualsDirectionTag direction;

	public bool setMaterialTag = false;
	public Enums.VisualsMaterialTag material;

	public bool setPositionTag = false;
	public Enums.VisualsPositionTag position;

	[Header("Upper Jaw")]
	public Image tooth18_28; //patch id 0
	public Image tooth17_27; //patch id 1
	public Image tooth16_26; //patch id 2
	public Image tooth15_25; //patch id 3
	public Image tooth14_24; //patch id 4
	public Image tooth13_23; //patch id 5
	public Image tooth12_22; //patch id 6
	public Image tooth11_21; //patch id 7
							 //patch id 8 - 15 are missing because sprites are just flipped when being displayed

	[Header("Lower Jaw")]
	public Image tooth38_48; //patch id 0
	public Image tooth37_47; //patch id 1
	public Image tooth36_46; //patch id 2
	public Image tooth35_45; //patch id 3
	public Image tooth34_44; //patch id 4
	public Image tooth33_43; //patch id 5
	public Image tooth32_42; //patch id 6
	public Image tooth31_41; //patch id 7
							 //patch id 8 - 15 are missing because sprites are just flipped when being displayed

	private void OnWizardUpdate()
	{
		isValid = componentToPopulate != null && !string.IsNullOrWhiteSpace(componentVisualsName);
		errorString = GenerateErrorString();
	}

	string GenerateErrorString()
	{
		string result = "";

		if (!isValid)
			result = "RPD Component cannot be null and Visuals Name must be filled in.";

		return result;
	}

	//Calling OnWizardCreate will close the window
	private void OnWizardCreate()
	{
		Populate();
	}

	//Calling OnWizardOtherButton will not close the window
	private void OnWizardOtherButton()
	{
		Populate();
	}

	void Populate()
	{
		if (!isValid)
			return;

		ComponentVisuals componentVisuals = null;

		bool createNewComponentVisuals = true;

		for (int i = 0; i < componentToPopulate.componentVisuals.Count; i++)
		{
			ComponentVisuals _componentVisuals = componentToPopulate.componentVisuals[i];

			if (_componentVisuals.name == componentVisualsName)
			{
				if (clearIfNamesMatch)
				{
					componentToPopulate.componentVisuals[i].Clear();
					componentToPopulate.componentVisuals[i].name = componentVisualsName;
				}

				componentVisuals = componentToPopulate.componentVisuals[i];
				createNewComponentVisuals = false;
			}
		}

		if (createNewComponentVisuals)
		{
			componentVisuals = new ComponentVisuals();
			componentVisuals.name = componentVisualsName;
			componentToPopulate.componentVisuals.Add(componentVisuals);
		}

		if (setDirectionTags)
			componentVisuals.direction = direction;

		if (setMaterialTag)
			componentVisuals.material = material;

		if (setPositionTag)
			componentVisuals.position = position;

		Image[] upperJawImages = new Image[] { tooth18_28, tooth17_27, tooth16_26, tooth15_25, tooth14_24, tooth13_23, tooth12_22, tooth11_21 };
		Image[] lowerJawImages = new Image[] { tooth38_48, tooth37_47, tooth36_46, tooth35_45, tooth34_44, tooth33_43, tooth32_42, tooth31_41 };

		List<Visuals> upperJawVisuals = componentVisuals.upperJawVisuals;
		List<Visuals> lowerJawVisuals = componentVisuals.lowerJawVisuals;


		for (int i = 0; i < 8; i++)
		{
			SetComponentVisuals(upperJawVisuals[i], upperJawImages[i]);
			SetComponentVisuals(lowerJawVisuals[i], lowerJawImages[i]);
		}

		void SetComponentVisuals(Visuals visuals, Image dataSource)
		{
			if (dataSource == null)
			{
				Debug.Log("No image provided, skipping.");
				return;
			}

			if (visuals == null)
			{
				Debug.LogError("Visuals is null!");
				return;
			}

			visuals.sprite = dataSource.sprite;
			visuals.color = dataSource.color;

			visuals.width = dataSource.rectTransform.rect.width;
			visuals.height = dataSource.rectTransform.rect.height;

			visuals.positionOffset = dataSource.rectTransform.anchoredPosition;
			visuals.rotationOffset = dataSource.rectTransform.localRotation.eulerAngles;
			visuals.scale = dataSource.rectTransform.localScale;
		}
	}

}

#endif
